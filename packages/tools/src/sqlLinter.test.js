'use strict';

const { lintSql } = require('./sqlLinter');

const table = (pureName, columns, schemaName = 'public') => ({
  pureName,
  schemaName,
  columns: columns.map(columnName => ({ columnName })),
});

const dbinfo = {
  tables: [
    table('users', ['id', 'name', 'email', 'created_at']),
    table('orders', ['id', 'user_id', 'total', 'status']),
  ],
  views: [table('active_users', ['id', 'name'])],
  matviews: [],
  procedures: [],
  functions: [],
};

const options = { dialect: 'postgres', dbinfo, schemaNames: ['public'], defaultSchema: 'public' };

const codes = (sql, opts = options) => lintSql(sql, opts).map(x => x.code);
const lint = (sql, opts = options) => lintSql(sql, opts);

describe('syntax', () => {
  test('valid queries have no messages', () => {
    for (const sql of [
      'SELECT * FROM users',
      'SELECT u.id, u.name AS n, count(*) cnt FROM users u JOIN orders o ON o.user_id = u.id WHERE u.id > 1 GROUP BY u.id, u.name HAVING count(*) > 1 ORDER BY cnt DESC LIMIT 10 OFFSET 5',
      "SELECT EXTRACT(YEAR FROM created_at), name FROM users WHERE email LIKE '%x%' AND id IN (1, 2)",
      'SELECT id FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > 10 ORDER BY total LIMIT 1)',
      'WITH big AS (SELECT * FROM orders WHERE total > 100) SELECT b.total, x FROM big b',
      'SELECT row_number() OVER (PARTITION BY user_id ORDER BY total) rn FROM orders',
      'UPDATE users SET name = $1 WHERE id = $2',
      "DELETE FROM orders WHERE status IS DISTINCT FROM 'x'",
      'INSERT INTO users (id, name) VALUES (1, \'x\') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
      'SELECT a.id FROM users a UNION ALL SELECT id FROM orders ORDER BY 1',
      'SELECT name::text t, CAST(id AS double precision) FROM users',
      'SELECT * FROM generate_series(1, 10) g WHERE g > 1',
      'SELECT * FROM users FOR UPDATE',
      'CREATE TABLE tmp (id int); SELECT foo FROM tmp',
      "SELECT 'unterminated -- no' AS x",
      'SELECT * FROM pg_tables',
      'SELECT * FROM information_schema.tables',
    ]) {
      expect([sql, codes(sql)]).toEqual([sql, []]);
    }
  });

  test('clause order', () => {
    expect(lint('SELECT * FROM users ORDER BY id WHERE id = 1')).toEqual([
      expect.objectContaining({ code: 'clauseOrder', values: { clause: 'WHERE', before: 'ORDER BY' }, start: 32 }),
    ]);
    expect(codes('SELECT * WHERE id = 1 FROM users')).toEqual(['clauseOrder']);
    expect(codes('SELECT * FROM users WHERE id = 1 JOIN orders ON orders.user_id = users.id')).toEqual(['clauseOrder']);
    expect(codes('SELECT * FROM users GROUP BY id HAVING count(*) > 1 GROUP BY name')).toEqual(['duplicateClause']);
    expect(codes('SELECT * FROM users WHERE id = 1 WHERE id = 2')).toEqual(['duplicateClause']);
    expect(codes('UPDATE users WHERE id = 1 SET name = 2')).toEqual(['clauseOrder']);
  });

  test('missing parts', () => {
    expect(codes('SELECT * FROM users WHERE ORDER BY id')).toEqual(['missingCondition']);
    expect(codes('SELECT * FROM users WHERE id = 1 AND ORDER BY id')).toEqual(['missingCondition']);
    expect(codes('SELECT * FROM WHERE id = 1')).toEqual(['missingTable']);
    expect(codes('SELECT FROM users', { ...options, dialect: 'mysql' })).toEqual(['missingColumns']);
    expect(codes('SELECT * FROM users WHERE id = ')).toEqual(['missingOperand']);
    expect(codes('SELECT * FROM users WHERE id = AND name = 1')).toEqual(['missingOperand']);
    expect(codes('SELECT * FROM users ORDER BY')).toEqual(['missingExpression']);
    expect(codes('SELECT * FROM users WHERE id IN 1')).toEqual(['expectedParenAfterIn']);
  });

  test('commas', () => {
    expect(codes('SELECT id, name, FROM users')).toEqual(['unexpectedComma']);
    expect(codes('SELECT id,, name FROM users')).toEqual(['unexpectedComma']);
    expect(codes('SELECT id name email FROM users')).toEqual(['missingComma']);
    expect(codes('SELECT * FROM users ORDER BY id name')).toEqual(['missingComma']);
  });

  test('parentheses, strings and comments', () => {
    expect(codes('SELECT count(* FROM users')).toEqual(['unclosedParen']);
    expect(codes('SELECT id) FROM users')).toEqual(['unmatchedParen']);
    expect(codes("SELECT 'abc FROM users")).toEqual(['unterminatedString']);
    expect(codes('SELECT "abc FROM users')).toEqual(['unterminatedIdentifier']);
    expect(codes('SELECT 1 /* comment')).toEqual(['unterminatedComment']);
  });

  test('mistyped keywords', () => {
    expect(lint('SELET * FROM users')).toEqual([expect.objectContaining({ code: 'unknownStatement', suggestion: 'SELECT' })]);
    expect(lint('SELECT * FORM users')).toEqual([expect.objectContaining({ code: 'unknownKeyword', suggestion: 'FROM' })]);
    expect(lint('SELECT * FROM users WHER id = 1')).toEqual([
      expect.objectContaining({ code: 'unknownKeyword', suggestion: 'WHERE' }),
    ]);
    expect(lint('SELECT * FROM users u WHERE id = 1 ADN name = 2')).toEqual([
      expect.objectContaining({ code: 'unknownKeyword', suggestion: 'AND' }),
    ]);
    // an alias similar to a keyword is not a typo
    expect(codes('SELECT * FROM orders ordr WHERE ordr.id = 1')).toEqual([]);
  });

  test('UPDATE and DELETE without WHERE', () => {
    expect(lint('UPDATE users SET name = 1')).toEqual([
      expect.objectContaining({ code: 'updateWithoutWhere', severity: 'warning' }),
    ]);
    expect(codes('DELETE FROM users')).toEqual(['deleteWithoutWhere']);
  });
});

describe('database structure', () => {
  test('unknown table with suggestion', () => {
    expect(lint('SELECT * FROM user')).toEqual([
      expect.objectContaining({ code: 'unknownTable', suggestion: 'users', start: 14, end: 18 }),
    ]);
    expect(codes('SELECT * FROM public.missing_tbl')).toEqual(['unknownTable']);
    expect(codes('INSERT INTO missing_tbl (a) VALUES (1)')).toEqual(['unknownTable']);
    expect(codes('UPDATE missing_tbl SET a = 1 WHERE b = 2')).toEqual(['unknownTable']);
    expect(codes('SELECT * FROM active_users')).toEqual([]);
  });

  test('unknown columns', () => {
    expect(lint('SELECT u.nme FROM users u')).toEqual([
      expect.objectContaining({ code: 'unknownColumn', values: { name: 'nme', table: 'u' }, suggestion: 'name' }),
    ]);
    expect(lint('SELECT nme FROM users WHERE id = 1')).toEqual([
      expect.objectContaining({ code: 'unknownColumnAny', suggestion: 'name' }),
    ]);
    expect(lint('SELECT * FROM users WHERE createdat > now()')).toEqual([
      expect.objectContaining({ code: 'unknownColumnAny', suggestion: 'created_at' }),
    ]);
    expect(codes('INSERT INTO users (id, nam) VALUES (1, 2)')).toEqual(['unknownColumn']);
    expect(codes('SELECT x.id FROM users u')).toEqual(['unknownAlias']);
    // select alias used in ORDER BY
    expect(codes('SELECT count(*) total FROM orders ORDER BY total')).toEqual([]);
  });

  test('no column checks without a full structure', () => {
    expect(codes('SELECT nme FROM users', { ...options, dbinfo: { ...dbinfo, isPartialStructure: true } })).toEqual([]);
    expect(codes('SELECT * FROM missing_tbl', { dialect: 'postgres' })).toEqual([]);
  });
});

describe('cursor', () => {
  test('unfinished statement is not reported while typing at its end', () => {
    expect(codes('SELECT * FROM users WHERE ', { ...options, cursorOffset: 26 })).toEqual([]);
    expect(codes('SELECT * FROM users WHERE ', { ...options, cursorOffset: 0 })).toEqual(['missingCondition']);
    expect(codes('SELECT * FROM us', { ...options, cursorOffset: 16 })).toEqual([]);
  });

  test('statements are separated by semicolon and empty line', () => {
    expect(codes('SELECT * FROM users WHERE\n\nSELECT 1', { ...options, cursorOffset: 0 })).toEqual(['missingCondition']);
    expect(codes('SELECT * FROM users;\nSELECT * FROM orders ORDER BY id WHERE id = 1')).toEqual(['clauseOrder']);
  });
});

describe('dialects', () => {
  test('SQL Server', () => {
    const mssql = { dialect: 'mssql' };
    expect(codes('SELECT TOP 10 [id] FROM [dbo].[users] WITH (NOLOCK)\nGO\nSELECT 1', mssql)).toEqual([]);
    expect(codes('SELECT * INTO #tmp FROM users; SELECT * FROM #tmp', mssql)).toEqual([]);
  });

  test('MySQL', () => {
    const mysql = { dialect: 'mysql' };
    expect(codes('SELECT * FROM `users` WHERE name = "it\\"s" # comment', mysql)).toEqual([]);
    expect(codes('UPDATE a JOIN b ON a.id = b.id SET a.x = 1 WHERE b.y = 2', mysql)).toEqual([]);
  });
});
