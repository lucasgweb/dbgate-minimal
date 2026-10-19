import _ from 'lodash';
import { addCompleter, setCompleters } from 'ace-builds/src-noconflict/ext-language_tools';
import { getConnectionInfo, getDatabaseInfo, getSchemaList } from '../utility/metadataLoaders';
import analyseQuerySources from './analyseQuerySources';
import { getStringSettingsValue } from '../settings/settingsTools';
import { findEngineDriver, findDefaultSchema } from 'dbgate-tools';
import { getExtensions } from '../stores';
import { _t } from '../translations';

// optional second item: database families the word is valid for ('!x,y' = all except x and y)
const KEYWORDS: (string | [string, string])[] = [
  'SELECT',
  'SELECT DISTINCT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'IN',
  'NOT IN',
  'EXISTS',
  'NOT EXISTS',
  'BETWEEN',
  'LIKE',
  ['ILIKE', 'postgres,duckdb'],
  'IS NULL',
  'IS NOT NULL',
  'NULL',
  'AS',
  'ON',
  'USING',
  'JOIN',
  'INNER JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'FULL JOIN',
  'CROSS JOIN',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'ASC',
  'DESC',
  ['LIMIT', '!mssql,oracle'],
  ['OFFSET', '!mssql,oracle'],
  ['TOP', 'mssql'],
  'UNION',
  'UNION ALL',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  ['RETURNING', 'postgres,sqlite,duckdb,oracle'],
  'TRUE',
  'FALSE',
  'WITH',
  'CREATE TABLE',
  'CREATE VIEW',
  'CREATE INDEX',
  'ALTER TABLE',
  'ADD COLUMN',
  'DROP TABLE',
  'DROP VIEW',
  'TRUNCATE TABLE',
  'PRIMARY KEY',
  'FOREIGN KEY',
  'REFERENCES',
  'DEFAULT',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'EXECUTE',
  'PROCEDURE',
  ['GO', 'mssql'],
];

// functions are inserted as snippets with the cursor inside the parentheses
const FUNCTIONS: string[][] = [
  ['COUNT', 'COUNT(${1:*})'],
  ['SUM', 'SUM(${1})'],
  ['AVG', 'AVG(${1})'],
  ['MIN', 'MIN(${1})'],
  ['MAX', 'MAX(${1})'],
  ['COALESCE', 'COALESCE(${1}, ${2})'],
  ['NULLIF', 'NULLIF(${1}, ${2})'],
  ['CAST', 'CAST(${1} AS ${2})'],
  ['UPPER', 'UPPER(${1})'],
  ['LOWER', 'LOWER(${1})'],
  ['TRIM', 'TRIM(${1})'],
  ['LENGTH', 'LENGTH(${1})', '!mssql'],
  ['SUBSTRING', 'SUBSTRING(${1})'],
  ['CONCAT', 'CONCAT(${1})'],
  ['REPLACE', 'REPLACE(${1}, ${2}, ${3})'],
  ['ROUND', 'ROUND(${1})'],
  ['ABS', 'ABS(${1})'],
  ['NOW', 'NOW()', '!mssql'],
  ['CURRENT_DATE', 'CURRENT_DATE'],
  ['CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP'],
  ['EXTRACT', 'EXTRACT(${1:YEAR} FROM ${2})', '!mssql,sqlite'],
  ['DATE_TRUNC', "DATE_TRUNC('${1:day}', ${2})", 'postgres,duckdb'],
  ['TO_CHAR', "TO_CHAR(${1}, '${2:YYYY-MM-DD}')", 'postgres,oracle'],
  ['STRING_AGG', "STRING_AGG(${1}, '${2:, }')", 'postgres,mssql,duckdb'],
  ['ARRAY_AGG', 'ARRAY_AGG(${1})', 'postgres,duckdb'],
  ['ROW_NUMBER', 'ROW_NUMBER() OVER (ORDER BY ${1})'],
  ['LEN', 'LEN(${1})', 'mssql'],
  ['GETDATE', 'GETDATE()', 'mssql'],
  ['ISNULL', 'ISNULL(${1}, ${2})', 'mssql'],
  ['FORMAT', "FORMAT(${1}, '${2:yyyy-MM-dd}')", 'mssql'],
  ['DATEADD', 'DATEADD(${1:day}, ${2:1}, ${3})', 'mssql'],
  ['DATEDIFF', 'DATEDIFF(${1:day}, ${2}, ${3})', 'mssql'],
  ['GROUP_CONCAT', 'GROUP_CONCAT(${1})', 'mysql,sqlite'],
  ['IFNULL', 'IFNULL(${1}, ${2})', 'mysql,sqlite'],
  ['DATE_FORMAT', "DATE_FORMAT(${1}, '${2:%Y-%m-%d}')", 'mysql'],
];

function getDatabaseFamily(engine: string) {
  const name = (engine || '').split('@')[0];
  if (/^(postgres|cockroach|redshift)/.test(name)) return 'postgres';
  if (/^(mysql|mariadb)/.test(name)) return 'mysql';
  return name;
}

function isAvailableFor(spec: string, family: string) {
  if (!spec) return true;
  if (spec.startsWith('!')) return !spec.slice(1).split(',').includes(family);
  return spec.split(',').includes(family);
}

// shortcuts offered at the beginning of a statement
const TEMPLATES = [
  ['sel', 'SELECT * FROM ${1}', 'SELECT * FROM …'],
  ['selw', 'SELECT * FROM ${1:table} WHERE ${2}', 'SELECT * FROM … WHERE …'],
  ['cnt', 'SELECT COUNT(*) FROM ${1}', 'SELECT COUNT(*) FROM …'],
  ['ins', 'INSERT INTO ${1:table} (${2}) VALUES (${3})', 'INSERT INTO … VALUES …'],
  ['upd', 'UPDATE ${1:table} SET ${2} WHERE ${3}', 'UPDATE … SET … WHERE …'],
  ['del', 'DELETE FROM ${1:table} WHERE ${2}', 'DELETE FROM … WHERE …'],
];

// words that need quoting when used as identifiers
const RESERVED_WORDS = new Set(
  'all and any as asc between by case check column constraint create cross current_date current_time current_timestamp current_user default delete desc distinct do else end except false fetch for foreign from full grant group having in inner insert intersect into is join key leading left like limit natural not null offset on or order outer primary references right select session_user set some table then to trailing true union unique update user using values when where window with'.split(
    ' '
  )
);

// keywords after which the completion opens automatically when a space is typed
const SPACE_TRIGGER_KEYWORDS = /\b(select|distinct|from|join|on|where|and|or|by|set|having|update|into|call|exec|execute|when|then|else)\s$/i;

const CLAUSE_KEYWORDS = [
  'SELECT',
  'FROM',
  'JOIN',
  'ON',
  'WHERE',
  'SET',
  'BY',
  'HAVING',
  'INTO',
  'VALUES',
  'UPDATE',
  'USING',
  'RETURNING',
  'LIMIT',
  'OFFSET',
];
const TABLE_POSITION_KEYWORDS = ['FROM', 'JOIN', 'UPDATE', 'INTO', 'TABLE'];
const COLUMN_CLAUSES = ['SELECT', 'WHERE', 'ON', 'SET', 'BY', 'HAVING', 'RETURNING', 'USING'];
const AFTER_SOURCE_WORDS = /^(WHERE|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|NATURAL|JOIN|ON|USING|ORDER|GROUP|HAVING|LIMIT|OFFSET|UNION|SET|AS|VALUES|RETURNING)$/i;

function createTableShortcut(name) {
  return (_.upperFirst(_.camelCase(name)).match(/[A-Z]/g) || []).join('').toLowerCase();
}

function stripQuotes(name: string) {
  return name.replace(/^["`\[]|["`\]]$/g, '');
}

/** Finds the statement under the cursor: statements are separated by ";" or by an empty line (outside strings and comments) */
function getStatementAtCursor(text: string, offset: number) {
  let start = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  const boundaries = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (ch == '\n') lineComment = false;
      else continue;
    }
    if (blockComment) {
      if (ch == '*' && next == '/') {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (ch == quote) quote = null;
      continue;
    }
    if (ch == "'" || ch == '"' || ch == '`') {
      quote = ch;
    } else if (ch == '[') {
      quote = ']';
    } else if (ch == '-' && next == '-') {
      lineComment = true;
      i++;
    } else if (ch == '/' && next == '*') {
      blockComment = true;
      i++;
    } else if (ch == ';') {
      boundaries.push([i, i + 1]);
    } else if (ch == '\n') {
      const emptyLine = text.slice(i + 1).match(/^[ \t\r]*\n/);
      if (emptyLine) boundaries.push([i, i + 1 + emptyLine[0].length]);
    }
  }
  for (const [boundaryStart, boundaryEnd] of boundaries) {
    if (boundaryStart >= offset) {
      return { text: text.slice(start, boundaryStart), cursor: offset - start };
    }
    start = Math.max(start, boundaryEnd);
  }
  return { text: text.slice(start), cursor: offset - start };
}

/** Words, quoted identifiers, strings and punctuation of a SQL text */
function tokenize(text: string) {
  return text.match(/"[^"]*"|`[^`]*`|\[[^\]]*\]|'[^']*'|[A-Za-z_][A-Za-z0-9_$.]*|[(),=<>!*+\-\/]/g) || [];
}

function analyseContext(beforeCursor: string) {
  const prefix = beforeCursor.match(/[A-Za-z0-9_$À-￿]*$/)[0];
  const beforePrefix = beforeCursor.slice(0, beforeCursor.length - prefix.length);
  const qualifierMatch = beforePrefix.match(/("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z0-9_$]+)\.$/);
  const tokens = tokenize(beforePrefix);
  const lastToken = (tokens[tokens.length - 1] || '').toUpperCase();
  const prevToken = (tokens[tokens.length - 2] || '').toUpperCase();

  let clause = null;
  let depth = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i].toUpperCase();
    if (token == ')') depth++;
    else if (token == '(') depth = Math.max(0, depth - 1);
    else if (depth == 0 && CLAUSE_KEYWORDS.includes(token)) {
      clause = token;
      break;
    }
  }

  const isIdentifier = token => /^[A-Za-z_"`\[]/.test(token) && !AFTER_SOURCE_WORDS.test(token);
  const isTablePosition =
    TABLE_POSITION_KEYWORDS.includes(lastToken) || (lastToken == ',' && (clause == 'FROM' || clause == 'JOIN'));
  // e.g. "FROM customers |" - an alias or a keyword follows, nothing should be inserted with Enter
  const isAliasPosition =
    !qualifierMatch &&
    (clause == 'FROM' || clause == 'JOIN' || clause == 'UPDATE' || clause == 'INTO') &&
    isIdentifier(lastToken) &&
    (TABLE_POSITION_KEYWORDS.includes(prevToken) || prevToken == ',');

  return {
    prefix,
    qualifier: qualifierMatch ? stripQuotes(qualifierMatch[1]) : null,
    lastToken,
    clause,
    isStatementStart: tokens.length == 0,
    isTablePosition,
    isJoinPosition: lastToken == 'JOIN',
    isOnPosition: lastToken == 'ON' || (clause == 'ON' && (lastToken == 'AND' || lastToken == 'OR')),
    isProcedurePosition: ['EXEC', 'EXECUTE', 'CALL'].includes(lastToken),
    isAliasPosition,
    isColumnPosition: COLUMN_CLAUSES.includes(clause) && !isTablePosition,
  };
}

export function mountCodeCompletion({ conid, database, editor, getText, getSettings }) {
  // whether Enter may insert the first suggestion, see doLiveAutocomplete
  let allowAutoSelect = true;

  setCompleters([]);
  addCompleter({
    getCompletions: async function (editor, session, pos, prefix, callback) {
      const dbinfo = await getDatabaseInfo({ conid, database });
      const schemaList = await getSchemaList({ conid, database });
      const connection = await getConnectionInfo({ conid });
      const driver = findEngineDriver(connection, getExtensions());
      const defaultSchema = findDefaultSchema(schemaList, driver?.dialect);
      const settings = getSettings();
      const useAliases = settings?.['sqlEditor.showTableAliasesInCodeCompletion'];
      const convertUpper = getStringSettingsValue('sqlEditor.sqlCommandsCase', 'upperCase') == 'upperCase';
      const family = getDatabaseFamily(driver?.engine);
      const lowercaseIdentifiers = family == 'postgres';

      const caseKeyword = (word: string) => (convertUpper ? word : word.toLowerCase());
      const quote = (name: string) => {
        const plain = lowercaseIdentifiers ? /^[a-z_][a-z0-9_$]*$/ : /^[A-Za-z_][A-Za-z0-9_$]*$/;
        if (plain.test(name) && !RESERVED_WORDS.has(name.toLowerCase())) return name;
        return driver?.dialect?.quoteIdentifier ? driver.dialect.quoteIdentifier(name) : `"${name}"`;
      };

      const fullText = session.getValue();
      const offset = session.doc.positionToIndex(pos);
      const statement = getStatementAtCursor(fullText, offset);
      const beforeCursor = statement.text.slice(0, statement.cursor);
      const ctx = analyseContext(beforeCursor);

      const keywordItems = (score: number) =>
        KEYWORDS.map(item => (_.isArray(item) ? item : [item, null]))
          .filter(([, spec]) => isAvailableFor(spec, family))
          .map(([word]) => ({
            caption: caseKeyword(word),
            value: caseKeyword(word),
            meta: _t('sqlCompletion.keyword', { defaultMessage: 'keyword' }),
            score,
          }));
      const functionItems = (score: number) =>
        FUNCTIONS.filter(([, , spec]) => isAvailableFor(spec, family)).map(([name, snippet]) => ({
          caption: caseKeyword(name),
          snippet: convertUpper ? snippet : snippet.replace(/^[A-Z_]+/, x => x.toLowerCase()),
          meta: _t('sqlCompletion.function', { defaultMessage: 'function' }),
          score,
        }));

      if (!dbinfo) {
        allowAutoSelect = !!ctx.prefix && !ctx.isAliasPosition;
        if (editor.completer) editor.completer.autoSelect = allowAutoSelect;
        callback(null, [...keywordItems(1000), ...functionItems(900)]);
        return;
      }

      const tableLikes = [
        ...dbinfo.tables.map(obj => ({ obj, kind: 'table' })),
        ...dbinfo.views.map(obj => ({ obj, kind: 'view' })),
        ...dbinfo.matviews.map(obj => ({ obj, kind: 'matview' })),
      ];
      const kindLabel = kind =>
        kind == 'table'
          ? _t('sqlCompletion.table', { defaultMessage: 'table' })
          : kind == 'view'
          ? _t('sqlCompletion.view', { defaultMessage: 'view' })
          : _t('sqlCompletion.matview', { defaultMessage: 'materialized view' });

      const findObject = (name: string) => {
        const lower = name.toLowerCase();
        const matching = tableLikes.filter(x => x.obj.pureName.toLowerCase() == lower).map(x => x.obj);
        return matching.find(x => x.pureName == name) || matching.find(x => x.schemaName == defaultSchema) || matching[0];
      };

      // tables/views used in the current statement
      const normalizedStatement = statement.text.replace(/["`\[\]]/g, '');
      const sourceNames = tableLikes.map(x => x.obj.pureName);
      const sources = analyseQuerySources(normalizedStatement, sourceNames)
        .map(src => ({ obj: findObject(src.name), alias: src.alias }))
        .filter(x => x.obj);
      const sourcesBeforeCursor = analyseQuerySources(beforeCursor.replace(/["`\[\]]/g, ''), sourceNames)
        .map(src => ({ obj: findObject(src.name), alias: src.alias }))
        .filter(x => x.obj);

      const sourceRef = source => source.alias || quote(source.obj.pureName);
      const qualifyColumns = sources.length > 1 || sources.some(x => x.alias);

      const columnItems = (source, qualified: boolean, score: number) => {
        const pkColumns = (source.obj.primaryKey?.columns || []).map(x => x.columnName);
        const fkColumns = _.flatten((source.obj.foreignKeys || []).map(fk => fk.columns.map(x => x.columnName)));
        return (source.obj.columns || []).map(col => {
          const flags = [pkColumns.includes(col.columnName) ? 'PK' : null, fkColumns.includes(col.columnName) ? 'FK' : null]
            .filter(Boolean)
            .join(' ');
          const prefixText = qualified ? `${source.alias || source.obj.pureName}.` : '';
          return {
            caption: `${prefixText}${col.columnName}`,
            value: qualified ? `${sourceRef(source)}.${quote(col.columnName)}` : quote(col.columnName),
            meta: [flags, col.dataType].filter(Boolean).join(' · '),
            score: score + (pkColumns.includes(col.columnName) ? 10 : 0),
          };
        });
      };

      const tableItems = (score: number, withAliases: boolean) => [
        ...(schemaList || []).map(x => ({
          caption: x.schemaName,
          value: quote(x.schemaName),
          meta: _t('sqlCompletion.schema', { defaultMessage: 'schema' }),
          score: score - 300,
        })),
        ...tableLikes.map(({ obj, kind }) => {
          const otherSchema = defaultSchema && obj.schemaName && obj.schemaName != defaultSchema;
          const name = otherSchema ? `${quote(obj.schemaName)}.${quote(obj.pureName)}` : quote(obj.pureName);
          const alias = withAliases ? ` ${createTableShortcut(obj.pureName)}` : '';
          return {
            caption: `${otherSchema ? `${obj.schemaName}.` : ''}${obj.pureName}${alias}`,
            value: `${name}${alias}`,
            meta: kindLabel(kind),
            score: otherSchema ? score - 200 : score,
          };
        }),
      ];

      // unique alias for a newly joined table
      const usedAliases = new Set(sources.map(x => (x.alias || x.obj.pureName).toLowerCase()));
      const createAlias = (name: string) => {
        const base = createTableShortcut(name) || name.slice(0, 1).toLowerCase() || 't';
        let alias = base;
        for (let i = 2; usedAliases.has(alias) || RESERVED_WORDS.has(alias); i++) alias = `${base}${i}`;
        return alias;
      };

      const sameTable = (fkSchema, fkTable, obj) =>
        fkTable == obj.pureName && (!fkSchema || !obj.schemaName || fkSchema == obj.schemaName);

      // join conditions between a new table (with alias) and the tables already used, from foreign keys
      const joinConditions = (newObj, newRef: string, others) => {
        const res = [];
        for (const other of others) {
          if (other.obj === newObj && sourceRef(other) == newRef) continue;
          const otherRef = sourceRef(other);
          for (const fk of newObj.foreignKeys || []) {
            if (sameTable(fk.refSchemaName, fk.refTableName, other.obj)) {
              res.push(
                fk.columns
                  .map(c => `${newRef}.${quote(c.columnName)} = ${otherRef}.${quote(c.refColumnName)}`)
                  .join(' AND ')
              );
            }
          }
          for (const fk of other.obj.foreignKeys || []) {
            if (sameTable(fk.refSchemaName, fk.refTableName, newObj)) {
              res.push(
                fk.columns
                  .map(c => `${newRef}.${quote(c.refColumnName)} = ${otherRef}.${quote(c.columnName)}`)
                  .join(' AND ')
              );
            }
          }
        }
        return _.uniq(res);
      };

      const joinMeta = _t('sqlCompletion.joinByForeignKey', { defaultMessage: 'join (foreign key)' });
      let list = [];
      let hasForeignKeySuggestions = false;

      if (ctx.qualifier) {
        // "alias." / "table." -> columns, "schema." -> objects of the schema
        const qualifierLower = ctx.qualifier.toLowerCase();
        const source =
          sources.find(x => (x.alias || '').toLowerCase() == qualifierLower) ||
          sources.find(x => x.obj.pureName.toLowerCase() == qualifierLower);
        const obj = source?.obj || findObject(ctx.qualifier);
        const schema = (schemaList || []).find(x => x.schemaName.toLowerCase() == qualifierLower);
        if (obj) {
          list = columnItems({ obj, alias: null }, false, 1500);
        } else if (schema) {
          list = tableLikes
            .filter(x => x.obj.schemaName == schema.schemaName)
            .map(({ obj, kind }) => ({ caption: obj.pureName, value: quote(obj.pureName), meta: kindLabel(kind), score: 1000 }));
          list.push(
            ...[...dbinfo.functions, ...dbinfo.procedures]
              .filter(x => x.schemaName == schema.schemaName)
              .map(x => ({
                caption: x.pureName,
                value: quote(x.pureName),
                meta: _t('sqlCompletion.function', { defaultMessage: 'function' }),
                score: 900,
              }))
          );
        }
      } else if (ctx.isProcedurePosition) {
        list = dbinfo.procedures.map(x => ({
          caption: x.pureName,
          value: quote(x.pureName),
          meta: _t('sqlCompletion.procedure', { defaultMessage: 'procedure' }),
          score: 1000,
        }));
      } else if (ctx.isTablePosition) {
        list = tableItems(1000, useAliases);
        if (ctx.isJoinPosition && sourcesBeforeCursor.length > 0) {
          // tables related to the already used ones, with the whole join condition
          for (const { obj } of tableLikes) {
            const alias = createAlias(obj.pureName);
            for (const condition of joinConditions(obj, alias, sourcesBeforeCursor)) {
              list.push({
                caption: `${obj.pureName} ${alias} ON ${condition}`,
                value: `${quote(obj.pureName)} ${alias} ON ${condition}`,
                meta: joinMeta,
                score: 3000,
              });
              hasForeignKeySuggestions = true;
            }
          }
        }
      } else if (ctx.isAliasPosition) {
        list = keywordItems(1000);
      } else {
        if (ctx.isOnPosition && sourcesBeforeCursor.length > 1) {
          const joined = sourcesBeforeCursor[sourcesBeforeCursor.length - 1];
          for (const condition of joinConditions(joined.obj, sourceRef(joined), sourcesBeforeCursor.slice(0, -1))) {
            list.push({ caption: condition, value: condition, meta: joinMeta, score: 3000 });
            hasForeignKeySuggestions = true;
          }
        }
        const columnScore = ctx.isColumnPosition ? 2000 : 1200;
        list.push(..._.flatten(sources.map(source => columnItems(source, qualifyColumns, columnScore))));
        list.push(...keywordItems(1000));
        list.push(...functionItems(ctx.isColumnPosition ? 1100 : 900));
        list.push(...tableItems(ctx.isColumnPosition ? 600 : 1000, useAliases));
        if (ctx.isStatementStart) {
          list.push(
            ...TEMPLATES.map(([caption, snippet, description]) => ({
              caption,
              snippet: (convertUpper ? snippet : snippet.replace(/\b[A-Z]{2,}\b/g, x => x.toLowerCase())).replace(
                ':table}',
                `:${_t('sqlCompletion.tablePlaceholder', { defaultMessage: 'table' })}}`
              ),
              meta: convertUpper ? description : description.toLowerCase(),
              score: 2500,
            }))
          );
        }
      }

      // after a space (empty prefix) the first item is preselected only for foreign key suggestions,
      // so that Enter still makes a new line; never preselect where an alias is typed
      allowAutoSelect = !ctx.isAliasPosition && (!!ctx.prefix || !!ctx.qualifier || hasForeignKeySuggestions);
      if (editor.completer) editor.completer.autoSelect = allowAutoSelect;

      callback(null, list);
    },
  });

  const isInStringOrComment = (session, cursor) => {
    const token = session.getTokenAt(cursor.row, cursor.column);
    return !!token && /string|comment/.test(token.type) && !/\.end/.test(token.type);
  };

  const doLiveAutocomplete = function (e) {
    const editor = e.editor;
    const hasCompleter = editor.completer && editor.completer.activated;
    const session = editor.session;
    const cursor = session.selection.cursor;
    const line = session.getLine(cursor.row).slice(0, cursor.column);

    if (e.command.name !== 'insertstring') return;
    if (isInStringOrComment(session, cursor)) return;

    if (/^[a-zA-Z_]/.test(e.args)) {
      if (!hasCompleter) {
        editor.execCommand('startAutocomplete');
      } else if (!allowAutoSelect && editor.completer) {
        // the user started typing in a list opened after a space, preselect the best match now
        const ctx = analyseContext(line);
        allowAutoSelect = !ctx.isAliasPosition;
        editor.completer.autoSelect = allowAutoSelect;
      }
    } else if (e.args == '.') {
      if (/[A-Za-z0-9_"`\]]\.$/.test(line)) editor.execCommand('startAutocomplete');
    } else if (e.args == ' ') {
      if (SPACE_TRIGGER_KEYWORDS.test(line) || /,\s$/.test(line)) {
        allowAutoSelect = false;
        editor.execCommand('startAutocomplete');
        if (editor.completer) editor.completer.autoSelect = false;
      }
    }
  };

  editor.commands.on('afterExec', doLiveAutocomplete);

  return () => {
    editor.commands.removeListener('afterExec', doLiveAutocomplete);
  };
}
