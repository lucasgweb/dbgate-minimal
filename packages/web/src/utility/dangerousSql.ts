import { splitQuery } from 'dbgate-query-splitter';

export interface CheckedStatement {
  text: string;
  kind: string;
}

/** Removes comments and the contents of string literals and quoted identifiers, so keywords inside them are ignored */
function stripCommentsAndStrings(sql: string) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``')
    .replace(/\[[^\]]*\]/g, '[]');
}

function splitStatements(sql: string, splitterOptions) {
  try {
    return splitQuery(sql, splitterOptions)
      .map(x => (typeof x == 'string' ? x : x?.text))
      .filter(x => x && x.trim());
  } catch (err) {
    return sql.split(';').filter(x => x.trim());
  }
}

/** First keyword of a statement, skipping a leading WITH ... (CTE) part */
function getStatementKind(stripped: string) {
  const text = stripped.trim();
  const first = (text.match(/^[a-z_]+/i)?.[0] || '').toUpperCase();
  if (first == 'WITH') {
    const main = text.match(/\)\s*(select|insert|update|delete|merge)\b/i);
    return main ? main[1].toUpperCase() : 'SELECT';
  }
  return first;
}

const MODIFYING_KINDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'REPLACE',
  'UPSERT',
  'ALTER',
  'DROP',
  'TRUNCATE',
  'CREATE',
  'RENAME',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE',
  'CALL',
];

/**
 * Analyses SQL before it is executed:
 * - unsafe: UPDATE / DELETE without WHERE (they change every row of the table)
 * - modifying: statements changing data or structure
 */
export function analyseDangerousSql(sql: string, splitterOptions) {
  const unsafe: CheckedStatement[] = [];
  const modifying: CheckedStatement[] = [];
  for (const text of splitStatements(sql, splitterOptions)) {
    const stripped = stripCommentsAndStrings(text);
    const kind = getStatementKind(stripped);
    if (MODIFYING_KINDS.includes(kind)) {
      modifying.push({ text: text.trim(), kind });
    }
    if ((kind == 'UPDATE' || kind == 'DELETE') && !/\bwhere\b/i.test(stripped)) {
      unsafe.push({ text: text.trim(), kind });
    }
    if (kind == 'TRUNCATE') {
      unsafe.push({ text: text.trim(), kind });
    }
  }
  return { unsafe, modifying };
}
