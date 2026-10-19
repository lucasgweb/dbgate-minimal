import type { DatabaseInfo } from 'dbgate-types';

// Real-time checks of SQL typed in the query editor: syntax problems (clause order, parentheses,
// unterminated strings, missing expressions, misplaced commas, mistyped keywords) and names not
// existing in the database structure (tables, columns, aliases). It is a heuristic linter, not a full
// parser - it reports only what it is quite sure about and stays silent in constructs it doesn't understand.

export type SqlLintSeverity = 'error' | 'warning';

export interface SqlLintMessage {
  start: number;
  end: number;
  severity: SqlLintSeverity;
  code: string;
  values?: { [name: string]: string };
  // existing similar name ("did you mean ...")
  suggestion?: string;
}

export interface SqlLintOptions {
  // database family: postgres, mysql, mssql, sqlite, oracle, duckdb...
  dialect?: string;
  dbinfo?: DatabaseInfo;
  schemaNames?: string[];
  defaultSchema?: string;
  // statements are separated also by an empty line (as in the query editor)
  splitByEmptyLine?: boolean;
  // problems of an unfinished statement are not reported while the cursor is at its end
  cursorOffset?: number;
}

type TokenType = 'word' | 'quoted' | 'string' | 'number' | 'param' | 'operator' | 'punct';

interface Token {
  type: TokenType;
  text: string;
  // uppercased text of a word
  upper: string;
  // identifier without quotes
  name: string;
  start: number;
  end: number;
}

interface LintMessage extends SqlLintMessage {
  // caused by the end of the statement, e.g. "WHERE" not followed by a condition
  incomplete?: boolean;
}

interface TableLike {
  pureName: string;
  schemaName?: string;
  columns?: { columnName: string }[];
}

interface Source {
  kind: 'table' | 'derived' | 'function' | 'cte' | 'opaque' | 'unknown';
  name?: string;
  alias?: string;
  obj?: TableLike;
}

interface Block {
  kind: 'select' | 'update' | 'delete';
  rank: number;
  last: string;
  seen: Set<string>;
  start: Token;
  hasWhere: boolean;
  skipWhereCheck: boolean;
}

interface Frame {
  block: Block;
  clause: string;
  open: number;
}

interface LintContext {
  dialect: string;
  messages: LintMessage[];
  // null when the database structure is not known
  tableLikes: TableLike[];
  columnsKnown: boolean;
  schemaNames: Set<string>;
  defaultSchema: string;
  createdNames: Set<string>;
  allNames: Set<string>;
  procedureNames: Set<string>;
}

// words which never are a column, table or alias name
const RESERVED = new Set(
  `ALL AND ANY APPLY ARRAY AS ASC AT BETWEEN BY CASE CAST COLLATE CONFLICT CROSS CURRENT DEFAULT DELETE DESC DISTINCT
  DO DUPLICATE ELSE END ESCAPE EXCEPT EXCLUDE EXISTS FALSE FETCH FILTER FIRST FOLLOWING FOR FROM FULL GROUP GROUPS
  HAVING ILIKE IN INNER INSERT INTERSECT INTERVAL INTO IS JOIN KEY LAST LATERAL LEFT LIKE LIMIT MINUS NATURAL NEXT NO
  NOT NOTHING NULL NULLS OF OFFSET ON ONLY OPTION OR ORDER OTHERS OUTER OUTPUT OVER PARTITION PERCENT PIVOT PRECEDING
  QUALIFY RANGE RECURSIVE REGEXP RETURNING RIGHT RLIKE ROW ROWS SELECT SET SIMILAR SOME STRAIGHT_JOIN TABLE TABLESAMPLE
  THEN TIES TO TOP TRUE UNBOUNDED UNION UNPIVOT UPDATE USING VALUES WHEN WHERE WINDOW WITH WITHIN ZONE`.split(/\s+/)
);

// words not checked as column names (keywords, data types, date parts, niladic functions, system columns)
const NON_COLUMN = new Set([
  ...RESERVED,
  ...`ABSOLUTE ACCESS ACTION AGAINST ASYMMETRIC AUTHORIZATION BIGINT BIGSERIAL BINARY BIT BLOB BOOL BOOLEAN BOTH BYTEA
  CENTURY CHAR CHARACTER CHARSET CIDR CLOB COLLATION CUBE CURRENT_CATALOG CURRENT_DATE CURRENT_ROLE CURRENT_SCHEMA
  CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER DATE DATETIME DATETIME2 DATETIMEOFFSET DAY DAYOFWEEK DAYOFYEAR DAYS DEC
  DECADE DECIMAL DELAYED DISTINCTROW DIV DOUBLE DOW DOY EPOCH EXPANSION FLOAT FORCE GROUPING HIGH_PRIORITY HOUR HOURS
  IGNORE IMAGE INDEX INET INT INT2 INT4 INT8 INTEGER ISNULL ISODOW ISOYEAR JSON JSONB LANGUAGE LEADING LEVEL LOCAL
  LOCALTIME LOCALTIMESTAMP LOCKED LOW_PRIORITY MATCHED MATERIALIZED MAX MEDIUMINT MICROSECOND MICROSECONDS MILLENNIUM
  MILLISECOND MILLISECONDS MINUTE MINUTES MOD MODE MONEY MONTH MONTHS NCHAR NOLOCK NOTNULL NOWAIT NTEXT NUMERIC
  NVARCHAR OVERLAPS PLACING PRECISION QUARTER QUERY QUICK READ REAL RECOMPILE ROLLUP ROWGUIDCOL ROWID ROWNUM SECOND
  SECONDS SEPARATOR SERIAL SESSION_USER SETS SHARE SIGNED SKIP SMALLDATETIME SMALLINT SMALLMONEY SQL_BIG_RESULT
  SQL_BUFFER_RESULT SQL_CALC_FOUND_ROWS SQL_CACHE SQL_NO_CACHE SQL_SMALL_RESULT SYMMETRIC SYSDATE SYSTEM_USER
  SYSTIMESTAMP TEXT TIME TIMESTAMP TIMESTAMPTZ TIMETZ TIMEZONE TIMEZONE_HOUR TIMEZONE_MINUTE TINYINT TRAILING UNIQUE
  UNIQUEIDENTIFIER UNKNOWN UNSIGNED USE USER UUID VARBINARY VARCHAR VARIADIC VARYING WEEK WEEKDAY WITHOUT XML XOR
  YEAR YEARS _ROWID_ OID CTID XMIN XMAX CMIN CMAX TABLEOID`.split(/\s+/),
]);

const STATEMENT_STARTS = new Set(
  `ABORT ALTER ANALYSE ANALYZE ATTACH BACKUP BEGIN BREAK BULK CALL CASE CHECK CHECKPOINT CLOSE CLUSTER COMMENT COMMIT
  CONTINUE COPY CREATE DBCC DEALLOCATE DECLARE DELETE DELIMITER DENY DESC DESCRIBE DETACH DISABLE DISCARD DO DROP
  ELSE ELSEIF ELSIF ENABLE END EXEC EXECUTE EXPLAIN FETCH FLUSH GET GO GOTO GRANT HANDLER HELP IF IMPORT INSERT
  INSTALL ITERATE KILL LEAVE LISTEN LOAD LOCK LOOP MERGE NOTIFY OPEN OPTIMIZE PRAGMA PREPARE PRINT PURGE RAISERROR
  REASSIGN RECONFIGURE REFRESH REINDEX RELEASE RENAME REPAIR REPEAT REPLACE RESET RESTORE RETURN REVOKE ROLLBACK
  SAVE SAVEPOINT SECURITY SELECT SET SHOW SHUTDOWN SIGNAL START STOP TABLE THROW TRUNCATE TRY UNINSTALL UNLISTEN
  UNLOCK UPDATE UPSERT USE VACUUM VALUES WAITFOR WHILE WITH`.split(/\s+/)
);

// statement keywords a mistyped first word of a statement is compared with
const TYPO_STATEMENTS = `SELECT INSERT UPDATE DELETE CREATE ALTER DROP TRUNCATE WITH EXPLAIN DECLARE EXECUTE BEGIN COMMIT ROLLBACK GRANT REVOKE MERGE`.split(
  ' '
);

// keywords a mistyped word inside a statement is compared with
const TYPO_KEYWORDS = `SELECT FROM WHERE GROUP ORDER HAVING JOIN INNER LEFT RIGHT OUTER LIMIT UNION VALUES INTO DISTINCT BETWEEN LIKE EXISTS AND`.split(
  ' '
);

// words ending a clause (a clause keyword followed by one of these misses its content)
const CLAUSE_END = new Set(
  'FROM WHERE GROUP ORDER HAVING LIMIT OFFSET UNION INTERSECT EXCEPT MINUS JOIN INNER CROSS NATURAL STRAIGHT_JOIN WINDOW RETURNING FETCH QUALIFY'.split(
    ' '
  )
);

const RANKS = {
  select: {
    SELECT: 0,
    FROM: 1,
    WHERE: 2,
    'GROUP BY': 3,
    HAVING: 4,
    WINDOW: 5,
    QUALIFY: 5,
    'ORDER BY': 6,
    LIMIT: 7,
    OFFSET: 7,
    FETCH: 7,
    FOR: 7,
    OPTION: 10,
  },
  update: { UPDATE: 0, SET: 1, OUTPUT: 1, FROM: 2, WHERE: 3, RETURNING: 4, 'ORDER BY': 4, LIMIT: 5, OPTION: 6 },
  delete: { DELETE: 0, FROM: 1, OUTPUT: 1, USING: 2, WHERE: 3, RETURNING: 4, 'ORDER BY': 4, LIMIT: 5, OPTION: 6 },
};

// clauses which may be repeated in a statement
const REPEATABLE = new Set(['delete:FROM']);

// clauses in which unqualified identifiers are column names
const COLUMN_CONTEXTS = new Set([
  'SELECT',
  'WHERE',
  'ON',
  'GROUP BY',
  'HAVING',
  'ORDER BY',
  'SET',
  'RETURNING',
  'USING',
  'QUALIFY',
  'CONFLICT',
]);

const COMPARISON_OPERATORS = new Set(['=', '<>', '!=', '<', '>', '<=', '>=']);

// tables available in triggers, MERGE and INSERT ... ON CONFLICT
const PSEUDO_TABLES = new Set(['new', 'old', 'excluded', 'inserted', 'deleted', 'source', 'target']);

const SYSTEM_SCHEMAS = new Set([
  'information_schema',
  'pg_catalog',
  'pg_toast',
  'sys',
  'mysql',
  'performance_schema',
  'main',
  'temp',
]);

const lower = (s: string) => (s || '').toLowerCase();

function isSystemTableName(name: string, dialect: string) {
  if (name == 'dual' || name.startsWith('pg_') || name.startsWith('sqlite_')) return true;
  if (dialect == 'mssql' && /^(sys|spt_)/.test(name)) return true;
  if (dialect == 'oracle' && /^(all_|user_|dba_|v\$|gv\$)/.test(name)) return true;
  return false;
}

/** Optimal string alignment distance (Levenshtein with transpositions) */
function editDistance(a: string, b: string) {
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] == b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** The most similar name to a mistyped one */
function suggestName(name: string, candidates: string[]) {
  const normalized = lower(name);
  const maxDistance = normalized.length <= 3 ? 1 : normalized.length <= 8 ? 2 : 3;
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of new Set(candidates)) {
    const candidateLower = lower(candidate);
    if (candidateLower == normalized) continue;
    const distance =
      candidateLower.replace(/_/g, '') == normalized.replace(/_/g, '')
        ? 0.5
        : Math.abs(candidateLower.length - normalized.length) > maxDistance
        ? Infinity
        : editDistance(normalized, candidateLower);
    if (distance <= maxDistance && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function findKeywordTypo(word: string, keywords: string[]) {
  if (word.length < 3) return null;
  for (const keyword of keywords) {
    if (keyword == word) return null;
    if (word.length < 4 && keyword.length >= 4) continue;
    if (Math.abs(keyword.length - word.length) <= 1 && editDistance(word, keyword) == 1) return keyword;
  }
  return null;
}

const NUMBER_RE = /0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const WORD_RE = /[A-Za-z_À-￿][\w$#À-￿]*/y;
const TEMP_TABLE_RE = /##?[\w$À-￿]+/y;
const PARAM_RE = /@@?[\w$#.]*|\$\d+|:[A-Za-z_][\w$]*|\?/y;
const MULTI_OPERATOR_RE = /->>|#>>|<=>|<>|!=|<=|>=|\|\||::|->|=>|:=|#>|@>|<@|&&|!~\*?|~\*|<<|>>/y;

function matchAt(re: RegExp, text: string, pos: number) {
  re.lastIndex = pos;
  const m = re.exec(text);
  return m ? m[0] : null;
}

function tokenize(sql: string, dialect: string, messages: LintMessage[]): Token[] {
  const tokens: Token[] = [];
  const n = sql.length;
  const add = (type: TokenType, start: number, end: number, name?: string) => {
    const text = sql.slice(start, end);
    tokens.push({ type, text, upper: type == 'word' ? text.toUpperCase() : text, name: name ?? text, start, end });
  };
  const lineEnd = (pos: number) => {
    const idx = sql.indexOf('\n', pos);
    return idx < 0 ? n : idx;
  };
  // index after the closing quote, -1 when not closed
  const readQuoted = (pos: number, close: string, backslash: boolean) => {
    for (let i = pos; i < n; i++) {
      const ch = sql[i];
      if (backslash && ch == '\\') {
        i++;
        continue;
      }
      if (ch == close) {
        if (sql[i + 1] == close) {
          i++;
          continue;
        }
        return i + 1;
      }
    }
    return -1;
  };
  const unterminated = (start: number, code: string) => {
    messages.push({ start, end: Math.max(lineEnd(start), start + 1), severity: 'error', code, incomplete: true });
  };

  let i = 0;
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' || /\s/.test(ch)) {
      i++;
      continue;
    }
    if ((ch == '-' && next == '-') || (ch == '#' && dialect == 'mysql')) {
      i = lineEnd(i);
      continue;
    }
    if (ch == '/' && next == '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end < 0) {
        messages.push({ start: i, end: i + 2, severity: 'error', code: 'unterminatedComment', incomplete: true });
        break;
      }
      i = end + 2;
      continue;
    }

    // string, optionally with a prefix: N'...', E'...', X'...', B'...'
    const prefixed = /[nNeExXbB]/.test(ch) && next == "'" && !/[\w$]/.test(sql[i - 1] || '');
    if (ch == "'" || prefixed || (ch == '"' && dialect == 'mysql')) {
      const quotePos = prefixed ? i + 1 : i;
      const end = readQuoted(quotePos + 1, sql[quotePos], dialect == 'mysql' || (prefixed && /[eE]/.test(ch)));
      if (end < 0) {
        unterminated(i, 'unterminatedString');
        add('string', i, n);
        break;
      }
      add('string', i, end);
      i = end;
      continue;
    }

    if (ch == '"' || ch == '`' || (ch == '[' && (dialect == 'mssql' || dialect == 'sqlite'))) {
      const close = ch == '[' ? ']' : ch;
      const end = readQuoted(i + 1, close, false);
      if (end < 0) {
        unterminated(i, 'unterminatedIdentifier');
        add('quoted', i, n, sql.slice(i + 1));
        break;
      }
      add('quoted', i, end, sql.slice(i + 1, end - 1).split(close + close).join(close));
      i = end;
      continue;
    }

    if (ch == '$' && (dialect == 'postgres' || dialect == 'duckdb')) {
      const tag = matchAt(/\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y, sql, i);
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        if (end < 0) {
          unterminated(i, 'unterminatedString');
          add('string', i, n);
          break;
        }
        add('string', i, end + tag.length);
        i = end + tag.length;
        continue;
      }
    }

    if (/[0-9]/.test(ch) || (ch == '.' && /[0-9]/.test(next || ''))) {
      const number = matchAt(NUMBER_RE, sql, i);
      add('number', i, i + number.length);
      i += number.length;
      continue;
    }

    const word = matchAt(WORD_RE, sql, i) || (dialect == 'mssql' && matchAt(TEMP_TABLE_RE, sql, i));
    if (word) {
      add('word', i, i + word.length);
      // GO - batch separator of SQL Server
      const token = tokens[tokens.length - 1];
      if (
        dialect == 'mssql' &&
        token.upper == 'GO' &&
        /(^|\n)[ \t]*$/.test(sql.slice(Math.max(0, i - 200), i)) &&
        /^[ \t]*\d*[ \t]*(\r?\n|$)/.test(sql.slice(i + 2, lineEnd(i) + 1))
      ) {
        token.type = 'punct';
        token.text = ';';
      }
      i += word.length;
      continue;
    }

    const multiOperator = matchAt(MULTI_OPERATOR_RE, sql, i);
    if (multiOperator) {
      add('operator', i, i + multiOperator.length);
      i += multiOperator.length;
      continue;
    }

    if (ch == '@' || ch == '?' || (ch == ':' && /[A-Za-z_]/.test(next || '')) || (ch == '$' && /[0-9]/.test(next || ''))) {
      const param = matchAt(PARAM_RE, sql, i);
      if (param) {
        add('param', i, i + param.length);
        i += param.length;
        continue;
      }
    }

    add('(),;.[]{}'.includes(ch) ? 'punct' : 'operator', i, i + 1);
    i++;
  }
  return tokens;
}

interface Statement {
  tokens: Token[];
  // end of the statement text (position of the separator)
  end: number;
}

function splitStatements(sql: string, tokens: Token[], splitByEmptyLine: boolean): Statement[] {
  const res: Statement[] = [];
  let current: Token[] = [];
  const flush = (end: number) => {
    if (current.length > 0) res.push({ tokens: current, end });
    current = [];
  };
  for (const token of tokens) {
    if (token.type == 'punct' && token.text == ';') {
      flush(token.start);
      continue;
    }
    if (splitByEmptyLine && current.length > 0) {
      // comments are replaced, so that a line with a comment is not empty
      const gap = sql
        .slice(current[current.length - 1].end, token.start)
        .replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, 'x');
      if (/\n[ \t\r]*\n/.test(gap)) flush(token.start);
    }
    current.push(token);
  }
  flush(sql.length);
  return res;
}

function collectCreatedNames(tokens: Token[], ctx: LintContext) {
  const isW = (t: Token, ...words: string[]) => !!t && t.type == 'word' && words.includes(t.upper);
  for (let i = 0; i < tokens.length; i++) {
    let k = -1;
    if (isW(tokens[i], 'CREATE')) {
      for (let j = i + 1; j < Math.min(tokens.length, i + 8); j++) {
        if (isW(tokens[j], 'TABLE', 'VIEW')) {
          k = j + 1;
          break;
        }
      }
    } else if (isW(tokens[i], 'RENAME') && isW(tokens[i + 1], 'TO')) {
      k = i + 2;
    }
    if (k < 0) continue;
    if (isW(tokens[k], 'IF') && isW(tokens[k + 1], 'NOT') && isW(tokens[k + 2], 'EXISTS')) k += 3;
    while (tokens[k + 1]?.text == '.' && tokens[k + 2]) k += 2;
    if (tokens[k] && (tokens[k].type == 'word' || tokens[k].type == 'quoted')) ctx.createdNames.add(lower(tokens[k].name));
  }
}

function lintStatement(st: Token[], stmtCtx: LintContext) {
  const ctx = stmtCtx;
  const n = st.length;
  const msg = (
    from: Token,
    to: Token,
    severity: SqlLintSeverity,
    code: string,
    values: { [name: string]: string } = undefined,
    extra: { incomplete?: boolean; suggestion?: string } = {}
  ) => {
    const message: LintMessage = { start: from.start, end: to.end, severity, code };
    if (values) message.values = values;
    if (extra.suggestion) message.suggestion = extra.suggestion;
    if (extra.incomplete) message.incomplete = true;
    ctx.messages.push(message);
  };
  const isW = (t: Token, ...words: string[]) => !!t && t.type == 'word' && words.includes(t.upper);
  const isP = (t: Token, text: string) => !!t && (t.type == 'punct' || t.type == 'operator') && t.text == text;
  const isIdent = (t: Token) => !!t && (t.type == 'quoted' || (t.type == 'word' && !RESERVED.has(t.upper)));

  const match: number[] = new Array(n).fill(-1);
  {
    const stack = [];
    for (let i = 0; i < n; i++) {
      if (isP(st[i], '(')) stack.push(i);
      else if (isP(st[i], ')') && stack.length > 0) {
        const open = stack.pop();
        match[open] = i;
        match[i] = open;
      }
    }
  }
  // index after the parenthesis opened at the index
  const afterParen = (i: number) => (match[i] < 0 ? n : match[i] + 1);

  const isClauseEnd = (t: Token, after: Token) => {
    if (!t) return true;
    if (isP(t, ')') || isP(t, ',')) return true;
    if (t.type != 'word') return false;
    if (CLAUSE_END.has(t.upper)) return true;
    return isW(t, 'LEFT', 'RIGHT', 'FULL') && !isP(after, '(');
  };
  const isConditionEnd = (t: Token, after: Token) =>
    isClauseEnd(t, after) || isW(t, 'AND', 'OR', 'THEN', 'ELSE', 'END', 'WHEN', 'ON', 'SET', 'USING');
  // tokens which may follow a table or column alias
  const isAliasFollower = (t: Token) =>
    !t || isP(t, ',') || isP(t, ')') || (t.type == 'word' && RESERVED.has(t.upper));
  const knownName = (name: string) => ctx.allNames.has(lower(name));

  const checkFollows = (
    i: number,
    from: Token,
    code: string,
    values: { [name: string]: string },
    isEnd: (t: Token, after: Token) => boolean
  ) => {
    const next = st[i + 1];
    if (!next) msg(from, st[i], 'error', code, values, { incomplete: true });
    else if (isEnd(next, st[i + 2])) msg(from, st[i], 'error', code, values);
  };

  const first = st[0];
  const isDml =
    isP(first, '(') || isW(first, 'SELECT', 'WITH', 'UPDATE', 'DELETE', 'INSERT', 'REPLACE', 'MERGE', 'UPSERT', 'VALUES');

  // mistyped statement keyword, e.g. "SELET"
  if (
    first.type == 'word' &&
    !STATEMENT_STARTS.has(first.upper) &&
    !ctx.procedureNames.has(lower(first.name)) &&
    !isP(st[1], '.') &&
    !isP(st[1], ':') &&
    !isP(st[1], '(')
  ) {
    const keyword = findKeywordTypo(first.upper, TYPO_STATEMENTS);
    if (keyword) msg(first, first, 'error', 'unknownStatement', { name: first.text }, { suggestion: keyword });
  }

  const consumed: boolean[] = new Array(n).fill(false);
  const reported: boolean[] = new Array(n).fill(false);
  const clauseAt: string[] = new Array(n).fill(null);
  const blockLevel: boolean[] = new Array(n).fill(false);
  const sources: Source[] = [];
  const cteNames = new Set<string>();
  const windowNames = new Set<string>();
  const insertColumns: { index: number; source: Source }[] = [];

  // names of common table expressions: WITH name [(columns)] AS (...)
  for (let i = 0; i < n; i++) {
    if (!(st[i].type == 'word' || st[i].type == 'quoted')) continue;
    if (!(isW(st[i - 1], 'WITH', 'RECURSIVE') || isP(st[i - 1], ','))) continue;
    let k = i + 1;
    if (isP(st[k], '(')) k = afterParen(k);
    if (!isW(st[k], 'AS')) continue;
    k++;
    if (isW(st[k], 'NOT')) k++;
    if (isW(st[k], 'MATERIALIZED')) k++;
    if (!isP(st[k], '(')) continue;
    cteNames.add(lower(st[i].name));
    const columnsEnd = isP(st[i + 1], '(') ? afterParen(i + 1) : i + 1;
    for (let j = i; j < columnsEnd; j++) consumed[j] = true;
  }

  const resolveTable = (parts: Token[]): Source => {
    const pure = parts[parts.length - 1].name;
    const pureLower = lower(pure);
    const schema = parts.length >= 2 ? lower(parts[parts.length - 2].name) : null;
    const opaque: Source = { kind: 'opaque', name: pure };
    if (!schema && cteNames.has(pureLower)) return { kind: 'cte', name: pure };
    if (!ctx.tableLikes || parts.length > 3 || ctx.createdNames.has(pureLower) || PSEUDO_TABLES.has(pureLower)) {
      return opaque;
    }
    if (schema && SYSTEM_SCHEMAS.has(schema)) return opaque;
    const candidates = ctx.tableLikes.filter(x => lower(x.pureName) == pureLower);
    const from = parts[0];
    const to = parts[parts.length - 1];
    if (schema && ctx.schemaNames.has(schema)) {
      const inSchema = candidates.filter(x => lower(x.schemaName) == schema);
      if (inSchema.length > 0) return { kind: 'table', name: pure, obj: inSchema[0] };
      if (parts.length > 2) return opaque;
      const suggestion = suggestName(
        pure,
        ctx.tableLikes.filter(x => lower(x.schemaName) == schema).map(x => x.pureName)
      );
      msg(from, to, 'error', 'unknownTable', { name: parts.map(x => x.name).join('.') }, { suggestion });
      return { kind: 'unknown', name: pure };
    }
    if (candidates.length > 0) {
      const obj = candidates.find(x => x.schemaName == ctx.defaultSchema) || candidates[0];
      return { kind: 'table', name: pure, obj };
    }
    // other database or not listed schema
    if (schema || isSystemTableName(pureLower, ctx.dialect)) return opaque;
    const suggestion = suggestName(pure, [...ctx.tableLikes.map(x => x.pureName), ...cteNames]);
    msg(from, to, 'error', 'unknownTable', { name: pure }, { suggestion });
    return { kind: 'unknown', name: pure };
  };

  // table reference at the index: name [AS alias], (subquery) alias, function(...) alias
  const readSource = (j: number, insertTarget = false) => {
    while (isW(st[j], 'ONLY', 'LATERAL', 'LOW_PRIORITY', 'IGNORE', 'QUICK', 'TABLE')) j++;
    if (isW(st[j], 'IF') && isW(st[j + 1], 'EXISTS')) j += 2;
    if (isW(st[j], 'TOP') && isP(st[j + 1], '(')) j = afterParen(j + 1);
    const t = st[j];
    if (!t) return;
    let source: Source;
    let k: number;
    if (isP(t, '(')) {
      source = { kind: 'derived' };
      k = afterParen(j);
    } else if (t.type == 'param' || (t.type == 'word' && t.text.startsWith('#'))) {
      // table variable or temporary table
      source = { kind: 'opaque', name: t.name };
      consumed[j] = true;
      k = j + 1;
    } else if (isIdent(t)) {
      const parts = [j];
      k = j + 1;
      while (isP(st[k], '.')) {
        if (isP(st[k + 1], '.')) {
          // SQL Server db..table
          k++;
          continue;
        }
        if (!(st[k + 1] && (st[k + 1].type == 'word' || st[k + 1].type == 'quoted'))) break;
        parts.push(k + 1);
        k += 2;
      }
      for (let x = j; x < k; x++) consumed[x] = true;
      if (isP(st[k], '(') && !insertTarget) {
        source = { kind: 'function' };
        k = afterParen(k);
      } else {
        source = resolveTable(parts.map(x => st[x]));
      }
    } else {
      return;
    }

    if (isW(st[k], 'PARTITION') && isP(st[k + 1], '(')) k = afterParen(k + 1);
    let aliasIndex = -1;
    if (isW(st[k], 'AS') && isIdent(st[k + 1])) {
      consumed[k] = true;
      aliasIndex = k + 1;
    } else if (isIdent(st[k]) && st[k].type == 'word' && !isAliasFollower(st[k + 1])) {
      // "FROM users WHER id = 1" - a mistyped keyword, not an alias
      const keyword = !knownName(st[k].name) && findKeywordTypo(st[k].upper, TYPO_KEYWORDS);
      if (keyword) {
        msg(st[k], st[k], 'error', 'unknownKeyword', { name: st[k].text }, { suggestion: keyword });
        reported[k] = true;
      } else {
        aliasIndex = k;
      }
    } else if (isIdent(st[k])) {
      aliasIndex = k;
    }
    if (aliasIndex >= 0) {
      consumed[aliasIndex] = true;
      source.alias = st[aliasIndex].name;
      k = aliasIndex + 1;
      if (isP(st[k], '(') && !insertTarget) {
        // column aliases - columns are renamed
        if (source.kind == 'table') source.kind = 'opaque';
        const end = afterParen(k);
        for (let x = k; x < end; x++) consumed[x] = true;
        k = end;
      }
    }
    if (insertTarget && isP(st[k], '(') && !isW(st[k + 1], 'SELECT', 'WITH', 'VALUES')) {
      const end = afterParen(k) - 1;
      for (let x = k + 1; x < end; x++) {
        if (isIdent(st[x])) {
          consumed[x] = true;
          insertColumns.push({ index: x, source });
        }
      }
    }
    sources.push(source);
  };

  const finishBlock = (block: Block) => {
    if (block && block.kind != 'select' && !block.hasWhere && !block.skipWhereCheck) {
      msg(block.start, block.start, 'warning', block.kind == 'update' ? 'updateWithoutWhere' : 'deleteWithoutWhere', undefined, {
        incomplete: true,
      });
    }
  };
  const startBlock = (frame: Frame, kind: Block['kind'], t: Token, skipWhereCheck = false) => {
    finishBlock(frame.block);
    frame.block = { kind, rank: 0, last: t.upper, seen: new Set([t.upper]), start: t, hasWhere: false, skipWhereCheck };
    frame.clause = t.upper;
  };
  const checkClause = (frame: Frame, name: string, from: Token, to: Token) => {
    const block = frame.block;
    if (!block) return;
    if (name == 'JOIN') {
      if (block.rank > (block.kind == 'select' ? 1 : 2)) {
        msg(from, to, 'error', 'clauseOrder', { clause: 'JOIN', before: block.last });
      }
      return;
    }
    const rank = RANKS[block.kind][name];
    if (rank == null) return;
    if (block.seen.has(name) && !REPEATABLE.has(`${block.kind}:${name}`)) {
      msg(from, to, 'error', 'duplicateClause', { clause: name });
    } else if (rank < block.rank) {
      msg(from, to, 'error', 'clauseOrder', { clause: name, before: block.last });
    } else {
      block.rank = rank;
      block.last = name;
    }
    block.seen.add(name);
  };

  // pass 1: clause structure, sources, syntax
  const frames: Frame[] = [{ block: null, clause: null, open: -1 }];
  for (let i = 0; i < n; i++) {
    const t = st[i];
    const frame = frames[frames.length - 1];
    clauseAt[i] = frame.clause;
    blockLevel[i] = !!frame.block;
    const prev = st[i - 1];
    const next = st[i + 1];

    if (isP(t, '(')) {
      frames.push({ block: null, clause: frame.clause, open: i });
      continue;
    }
    if (isP(t, ')')) {
      if (frames.length > 1) finishBlock(frames.pop().block);
      else msg(t, t, 'error', 'unmatchedParen');
      continue;
    }
    if (isP(t, ',')) {
      if (!prev || isP(prev, '(') || isW(prev, 'SELECT', 'BY', 'SET', 'WHERE', 'FROM', 'VALUES')) {
        msg(t, t, 'error', 'unexpectedComma');
      } else if (!next) {
        msg(t, t, 'error', 'unexpectedComma', undefined, { incomplete: true });
      } else if (isClauseEnd(next, st[i + 2])) {
        msg(t, t, 'error', 'unexpectedComma');
      }
      if (frame.block && (frame.clause == 'FROM' || frame.clause == 'UPDATE')) readSource(i + 1);
      continue;
    }
    if (t.type == 'operator' && COMPARISON_OPERATORS.has(t.text)) {
      if (!next) {
        msg(t, t, 'error', 'missingOperand', { operator: t.text }, { incomplete: true });
      } else if (isConditionEnd(next, st[i + 2]) && !isW(prev, 'USING')) {
        msg(t, t, 'error', 'missingOperand', { operator: t.text });
      } else if (!prev || isP(prev, '(') || isP(prev, ',') || isW(prev, 'WHERE', 'AND', 'OR', 'ON', 'HAVING', 'WHEN')) {
        msg(t, t, 'error', 'missingOperandBefore', { operator: t.text });
      }
      continue;
    }
    if (t.type != 'word' || isP(prev, '.') || isP(next, '.')) continue;

    const word = t.upper;
    switch (word) {
      case 'SELECT': {
        startBlock(frame, 'select', t);
        let k = i + 1;
        if (isW(st[k], 'DISTINCT', 'ALL', 'DISTINCTROW')) k++;
        if (isW(st[k - 1], 'DISTINCT') && isW(st[k], 'ON') && isP(st[k + 1], '(')) k = afterParen(k + 1);
        if (isW(st[k], 'TOP')) {
          k = isP(st[k + 1], '(') ? afterParen(k + 1) : k + 2;
          if (isW(st[k], 'PERCENT')) k++;
          if (isW(st[k], 'WITH') && isW(st[k + 1], 'TIES')) k += 2;
        }
        const target = st[k];
        if (!target) {
          msg(t, t, 'error', 'missingColumns', undefined, { incomplete: true });
        } else if (
          isClauseEnd(target, st[k + 1]) &&
          !isP(target, ',') &&
          !(isW(target, 'FROM') && ctx.dialect == 'postgres')
        ) {
          msg(t, t, 'error', 'missingColumns');
        }
        break;
      }
      case 'UPDATE':
      case 'DELETE': {
        if (
          isP(prev, ',') ||
          isP(prev, '(') ||
          isW(prev, 'FOR', 'KEY', 'ON', 'OR', 'BEFORE', 'AFTER', 'OF', 'GRANT', 'REVOKE', 'INSTEAD')
        ) {
          break;
        }
        startBlock(frame, word == 'UPDATE' ? 'update' : 'delete', t, isW(prev, 'THEN', 'DO'));
        if (word == 'UPDATE') {
          if (!isW(next, 'SET')) readSource(i + 1);
        } else if (isIdent(next) && (!st[i + 2] || isW(st[i + 2], 'WHERE'))) {
          // DELETE table WHERE ...
          readSource(i + 1);
        }
        break;
      }
      case 'INSERT':
      case 'MERGE':
      case 'UPSERT':
      case 'REPLACE': {
        if (word == 'REPLACE' && isP(next, '(')) break;
        if (isP(prev, ',') || isW(prev, 'OR', 'BEFORE', 'AFTER', 'OF', 'FOR', 'GRANT', 'REVOKE', 'INSTEAD')) break;
        finishBlock(frame.block);
        frame.block = null;
        frame.clause = 'INSERT';
        break;
      }
      case 'INTO': {
        if (frame.block?.kind == 'select') {
          // SELECT ... INTO new_table / INTO @variable
          if (isIdent(next)) {
            ctx.createdNames.add(lower(next.name));
            consumed[i + 1] = true;
          }
          frame.clause = 'INTO';
          break;
        }
        if (isW(next, 'OUTFILE', 'DUMPFILE')) break;
        frame.clause = 'INTO';
        readSource(i + 1, true);
        break;
      }
      case 'FROM': {
        if (isW(prev, 'DISTINCT') && isW(st[i - 2], 'IS', 'NOT')) break;
        // EXTRACT(... FROM ...), REVOKE ... FROM
        if (!frame.block) break;
        checkClause(frame, 'FROM', t, t);
        frame.clause = 'FROM';
        checkFollows(i, t, 'missingTable', { keyword: 'FROM' }, (x, after) => isClauseEnd(x, after) || isW(x, 'ON', 'USING', 'SET'));
        readSource(i + 1);
        break;
      }
      case 'JOIN':
      case 'APPLY':
      case 'STRAIGHT_JOIN': {
        if (!frame.block) break;
        let s = i;
        while (isW(st[s - 1], 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'NATURAL', 'SEMI', 'ANTI', 'ASOF')) s--;
        checkClause(frame, 'JOIN', st[s], t);
        frame.clause = 'JOIN';
        checkFollows(i, st[s], 'missingTable', { keyword: 'JOIN' }, (x, after) => isClauseEnd(x, after) || isW(x, 'ON', 'USING', 'SET'));
        readSource(i + 1);
        break;
      }
      case 'ON': {
        if (isW(next, 'CONFLICT', 'DUPLICATE')) {
          finishBlock(frame.block);
          frame.block = null;
          frame.clause = 'CONFLICT';
          break;
        }
        if (frame.block && (frame.clause == 'JOIN' || frame.clause == 'FROM' || frame.clause == 'ON')) {
          frame.clause = 'ON';
          checkFollows(i, t, 'missingCondition', { keyword: 'ON' }, isConditionEnd);
        }
        break;
      }
      case 'USING': {
        if (frame.block?.kind == 'delete') {
          checkClause(frame, 'USING', t, t);
          frame.clause = 'FROM';
          readSource(i + 1);
        } else if (!frame.block && isW(first, 'MERGE')) {
          frame.clause = 'FROM';
          readSource(i + 1);
        } else if (frame.block) {
          frame.clause = 'USING';
        }
        break;
      }
      case 'WHERE': {
        if (frame.block) {
          checkClause(frame, 'WHERE', t, t);
          frame.block.hasWhere = true;
        }
        frame.clause = 'WHERE';
        checkFollows(i, t, 'missingCondition', { keyword: 'WHERE' }, isConditionEnd);
        break;
      }
      case 'GROUP':
      case 'ORDER':
      case 'PARTITION': {
        if (!isW(next, 'BY')) break;
        const name = `${word} BY`;
        if (word != 'PARTITION') checkClause(frame, name, t, next);
        frame.clause = word == 'GROUP' ? 'GROUP BY' : 'ORDER BY';
        clauseAt[i + 1] = frame.clause;
        blockLevel[i + 1] = !!frame.block;
        i++;
        checkFollows(i, t, 'missingExpression', { keyword: name }, isClauseEnd);
        break;
      }
      case 'HAVING':
      case 'QUALIFY': {
        checkClause(frame, word, t, t);
        frame.clause = word;
        checkFollows(i, t, 'missingCondition', { keyword: word }, isConditionEnd);
        break;
      }
      case 'WINDOW': {
        if (frame.block?.kind != 'select' || !isIdent(next) || !isW(st[i + 2], 'AS')) break;
        checkClause(frame, 'WINDOW', t, t);
        frame.clause = 'WINDOW';
        windowNames.add(lower(next.name));
        consumed[i + 1] = true;
        break;
      }
      case 'LIMIT':
      case 'OFFSET': {
        if (!frame.block) break;
        checkClause(frame, word, t, t);
        frame.clause = 'LIMIT';
        checkFollows(i, t, 'missingExpression', { keyword: word }, isClauseEnd);
        break;
      }
      case 'FETCH': {
        if (frame.block?.kind == 'select' && isW(next, 'FIRST', 'NEXT')) {
          checkClause(frame, 'FETCH', t, t);
          frame.clause = 'LIMIT';
        }
        break;
      }
      case 'FOR': {
        if (frame.block?.kind == 'select' && isW(next, 'UPDATE', 'SHARE', 'NO', 'KEY', 'READ', 'XML', 'JSON', 'BROWSE')) {
          checkClause(frame, 'FOR', t, t);
          frame.clause = 'FOR';
        }
        break;
      }
      case 'OPTION': {
        if (frame.block && isP(next, '(')) {
          checkClause(frame, 'OPTION', t, t);
          frame.clause = 'OPTION';
        }
        break;
      }
      case 'SET': {
        if (frame.block?.kind == 'update') {
          checkClause(frame, 'SET', t, t);
          frame.clause = 'SET';
          checkFollows(i, t, 'missingAssignment', undefined, (x, after) => isClauseEnd(x, after) && !isP(x, ')'));
        } else if (frame.clause == 'INSERT' || frame.clause == 'INTO' || frame.clause == 'CONFLICT') {
          // INSERT INTO t SET a = 1 (MySQL)
          frame.clause = 'SET';
        } else {
          frame.clause = 'SET_STATEMENT';
        }
        break;
      }
      case 'RETURNING':
      case 'OUTPUT': {
        if (frame.block) checkClause(frame, word, t, t);
        frame.clause = 'RETURNING';
        break;
      }
      case 'VALUES': {
        if (frame.clause == null || frame.clause == 'INTO' || frame.clause == 'INSERT') frame.clause = 'VALUES';
        break;
      }
      case 'UNION':
      case 'INTERSECT':
      case 'EXCEPT':
      case 'MINUS': {
        finishBlock(frame.block);
        frame.block = null;
        frame.clause = null;
        break;
      }
      case 'AND':
      case 'OR': {
        checkFollows(i, t, 'missingCondition', { keyword: word }, isConditionEnd);
        break;
      }
      case 'LIKE':
      case 'ILIKE': {
        checkFollows(i, t, 'missingOperand', { operator: word }, isConditionEnd);
        break;
      }
      case 'IN': {
        if (frame.block && !isP(next, '(') && !isW(next, 'BOOLEAN', 'NATURAL')) {
          msg(t, t, 'error', 'expectedParenAfterIn', undefined, next ? {} : { incomplete: true });
        }
        break;
      }
      case 'TRUNCATE': {
        if (i == 0) readSource(i + 1);
        break;
      }
      case 'ALTER': {
        if (i == 0 && isW(next, 'TABLE')) readSource(i + 1);
        break;
      }
    }
  }
  while (frames.length > 1) {
    const frame = frames.pop();
    finishBlock(frame.block);
    msg(st[frame.open], st[frame.open], 'error', 'unclosedParen', undefined, { incomplete: true });
  }
  finishBlock(frames[0].block);

  // pass 2: names

  // dotted names: alias.column, schema.table...
  const chainPart: boolean[] = new Array(n).fill(false);
  const chains: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (!(st[i].type == 'word' || st[i].type == 'quoted') || !isP(st[i + 1], '.') || isP(st[i - 1], '.')) continue;
    const parts = [i];
    let k = i;
    while (isP(st[k + 1], '.') && st[k + 2] && (st[k + 2].type == 'word' || st[k + 2].type == 'quoted' || isP(st[k + 2], '*'))) {
      k += 2;
      parts.push(k);
    }
    for (const part of parts) chainPart[part] = true;
    if (!consumed[i] && !isP(st[k + 1], '(')) chains.push(parts);
  }

  const operandEnd = (idx: number) => {
    const t = st[idx];
    if (!t) return false;
    if (t.type == 'quoted' || t.type == 'string' || t.type == 'param') return true;
    if (t.type == 'word') return !RESERVED.has(t.upper) || isW(t, 'END', 'NULL', 'TRUE', 'FALSE');
    if (t.type == 'number') return !isW(st[idx - 1], 'TOP', 'LIMIT', 'OFFSET', 'FIRST', 'NEXT', 'INTERVAL');
    if (isP(t, ')')) {
      const open = match[idx];
      return !(open > 0 && isW(st[open - 1], 'TOP', 'ON', 'USING', 'IN', 'EXISTS', 'VALUES'));
    }
    return false;
  };

  // aliases and mistyped keywords
  const aliasAt: boolean[] = new Array(n).fill(false);
  const skip: boolean[] = new Array(n).fill(false);
  const aliasNames = new Set<string>(sources.filter(x => x.alias).map(x => lower(x.alias)));
  for (let i = 0; i < n; i++) {
    const t = st[i];
    if (consumed[i] || chainPart[i] || reported[i] || !isIdent(t)) continue;
    const prev = st[i - 1];
    if (isP(st[i + 1], '(') || isP(prev, '::')) {
      skip[i] = true;
      continue;
    }
    if (isW(prev, 'AS')) {
      aliasAt[i] = true;
      aliasNames.add(lower(t.name));
      continue;
    }
    // "SELECT * FORM users"
    if (
      t.type == 'word' &&
      (operandEnd(i - 1) || isP(prev, '*')) &&
      !isAliasFollower(st[i + 1]) &&
      !knownName(t.name) &&
      !aliasNames.has(lower(t.name))
    ) {
      const keyword = findKeywordTypo(t.upper, TYPO_KEYWORDS);
      if (keyword) {
        msg(t, t, 'error', 'unknownKeyword', { name: t.text }, { suggestion: keyword });
        skip[i] = true;
        continue;
      }
    }
    if (t.type == 'word' && NON_COLUMN.has(t.upper)) {
      skip[i] = true;
      continue;
    }
    if (operandEnd(i - 1)) {
      aliasAt[i] = true;
      aliasNames.add(lower(t.name));
      if (
        blockLevel[i] &&
        ((clauseAt[i] == 'SELECT' && aliasAt[i - 1]) ||
          ((clauseAt[i] == 'GROUP BY' || clauseAt[i] == 'ORDER BY') && !consumed[i - 1]))
      ) {
        msg(t, t, 'error', 'missingComma', { name: t.text });
      }
    }
  }

  if (!ctx.tableLikes) return;

  const hasColumns = (obj: TableLike) => ctx.columnsKnown && obj?.columns?.length > 0;
  const hasColumn = (obj: TableLike, name: string) => obj.columns.some(x => lower(x.columnName) == lower(name));

  // INSERT INTO table (columns)
  for (const { index, source } of insertColumns) {
    if (source.kind == 'table' && hasColumns(source.obj) && !hasColumn(source.obj, st[index].name)) {
      msg(st[index], st[index], 'error', 'unknownColumn', { name: st[index].name, table: source.obj.pureName }, {
        suggestion: suggestName(st[index].name, source.obj.columns.map(x => x.columnName)),
      });
    }
  }

  // alias.column
  for (const parts of chains) {
    if (parts.length != 2) continue;
    const qualifier = st[parts[0]];
    const column = st[parts[1]];
    const qualifierLower = lower(qualifier.name);
    const byAlias = sources.filter(x => x.alias && lower(x.alias) == qualifierLower);
    const matching = byAlias.length > 0 ? byAlias : sources.filter(x => x.name && lower(x.name) == qualifierLower);
    if (matching.length > 0) {
      if (isP(column, '*')) continue;
      if (!matching.every(x => x.kind == 'table' && hasColumns(x.obj))) continue;
      if (matching.some(x => hasColumn(x.obj, column.name))) continue;
      msg(column, column, 'error', 'unknownColumn', { name: column.name, table: qualifier.name }, {
        suggestion: suggestName(column.name, matching[0].obj.columns.map(x => x.columnName)),
      });
      continue;
    }
    if (!isDml) continue;
    if (
      cteNames.has(qualifierLower) ||
      aliasNames.has(qualifierLower) ||
      windowNames.has(qualifierLower) ||
      ctx.schemaNames.has(qualifierLower) ||
      SYSTEM_SCHEMAS.has(qualifierLower) ||
      PSEUDO_TABLES.has(qualifierLower) ||
      ctx.createdNames.has(qualifierLower) ||
      ctx.tableLikes.some(x => lower(x.pureName) == qualifierLower) ||
      isW(column, 'NEXTVAL', 'CURRVAL')
    ) {
      continue;
    }
    msg(qualifier, qualifier, 'warning', 'unknownAlias', { name: qualifier.name }, {
      suggestion: suggestName(qualifier.name, [...sources.filter(x => x.alias).map(x => x.alias), ...sources.filter(x => x.name).map(x => x.name)]),
    });
  }

  // unqualified columns - only when all used tables are known
  if (!isDml || sources.length == 0 || !sources.every(x => x.kind == 'table' && hasColumns(x.obj))) return;
  const columnNames = sources.flatMap(x => x.obj.columns.map(c => c.columnName));
  const knownColumns = new Set(columnNames.map(lower));
  const sourceNames = new Set(sources.map(x => lower(x.name)));
  for (let i = 0; i < n; i++) {
    const t = st[i];
    if (consumed[i] || chainPart[i] || skip[i] || aliasAt[i] || reported[i] || !isIdent(t)) continue;
    if (t.type == 'word' && NON_COLUMN.has(t.upper)) continue;
    const prev = st[i - 1];
    if (isW(prev, 'COLLATE', 'OVER') || isP(st[i + 1], '=>')) continue;
    if (isW(prev, 'USING') && clauseAt[i] != 'USING') continue;
    if (!COLUMN_CONTEXTS.has(clauseAt[i])) continue;
    const nameLower = lower(t.name);
    if (
      knownColumns.has(nameLower) ||
      aliasNames.has(nameLower) ||
      cteNames.has(nameLower) ||
      windowNames.has(nameLower) ||
      sourceNames.has(nameLower)
    ) {
      continue;
    }
    msg(t, t, 'warning', 'unknownColumnAny', { name: t.name }, { suggestion: suggestName(t.name, columnNames) });
  }
}

// messages reported while a name is being typed
const TYPING_CODES = new Set([
  'unknownTable',
  'unknownColumn',
  'unknownColumnAny',
  'unknownAlias',
  'unknownKeyword',
  'unknownStatement',
  'missingComma',
]);

export function lintSql(sql: string, options: SqlLintOptions = {}): SqlLintMessage[] {
  const dialect = options.dialect || '';
  const dbinfo = options.dbinfo;
  const messages: LintMessage[] = [];
  const tokens = tokenize(sql, dialect, messages);
  const tokenizerMessages = messages.length;

  const tableLikes: TableLike[] = dbinfo
    ? [...(dbinfo.tables || []), ...(dbinfo.views || []), ...(dbinfo.matviews || [])]
    : null;
  const allNames = new Set<string>();
  for (const obj of tableLikes || []) {
    allNames.add(lower(obj.pureName));
    for (const col of obj.columns || []) allNames.add(lower(col.columnName));
  }
  const ctx: LintContext = {
    dialect,
    messages,
    // without any object, the structure is probably not loaded yet
    tableLikes: tableLikes?.length > 0 ? tableLikes : null,
    columnsKnown: !!dbinfo && !dbinfo.isPartialStructure,
    schemaNames: new Set((options.schemaNames || []).map(lower)),
    defaultSchema: options.defaultSchema,
    createdNames: new Set(),
    allNames,
    procedureNames: new Set([...(dbinfo?.procedures || []), ...(dbinfo?.functions || [])].map(x => lower(x.pureName))),
  };
  for (const schema of ctx.schemaNames) allNames.add(schema);
  collectCreatedNames(tokens, ctx);

  const cursor = options.cursorOffset;
  const dropped = new Set<LintMessage>();
  for (const message of messages) {
    // an unterminated string or comment continues to the end of the text
    if (message.incomplete && cursor != null && cursor >= message.start) dropped.add(message);
  }

  for (const statement of splitStatements(sql, tokens, options.splitByEmptyLine ?? true)) {
    const before = messages.length;
    lintStatement(statement.tokens, ctx);
    const tailStart = statement.tokens[statement.tokens.length - 1].start;
    if (cursor != null && cursor >= tailStart && cursor <= statement.end) {
      for (let i = before; i < messages.length; i++) {
        if (messages[i].incomplete) dropped.add(messages[i]);
      }
    }
  }

  const res: SqlLintMessage[] = [];
  const keys = new Set<string>();
  messages.forEach((message, index) => {
    if (dropped.has(message)) return;
    if (index >= tokenizerMessages && cursor != null && TYPING_CODES.has(message.code)) {
      if (cursor >= message.start && cursor <= message.end) return;
    }
    const key = `${message.start}:${message.code}`;
    if (keys.has(key)) return;
    keys.add(key);
    const { incomplete, ...rest } = message;
    res.push(rest);
  });
  res.sort((a, b) => a.start - b.start);
  return res;
}
