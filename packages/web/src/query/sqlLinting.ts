import { findDefaultSchema, findEngineDriver, lintSql, SqlLintMessage } from 'dbgate-tools';
import { getConnectionInfo, useDatabaseInfo, useSchemaList } from '../utility/metadataLoaders';
import { getExtensions } from '../stores';
import { _t } from '../translations';
import { getDatabaseFamily } from './codeCompletion';

export interface EditorLintMessage {
  start: number;
  end: number;
  severity: 'error' | 'warning';
  message: string;
}

// bigger scripts are not checked while typing
const MAX_LINTED_LENGTH = 200000;
const LINT_DELAY = 400;

function translateMessage(msg: SqlLintMessage) {
  const values = msg.values || {};
  switch (msg.code) {
    case 'unterminatedString':
      return _t('sqlLint.unterminatedString', { defaultMessage: 'Unterminated string' });
    case 'unterminatedIdentifier':
      return _t('sqlLint.unterminatedIdentifier', { defaultMessage: 'Unterminated quoted identifier' });
    case 'unterminatedComment':
      return _t('sqlLint.unterminatedComment', { defaultMessage: 'Unterminated comment' });
    case 'unmatchedParen':
      return _t('sqlLint.unmatchedParen', { defaultMessage: 'Closing parenthesis without an opening one' });
    case 'unclosedParen':
      return _t('sqlLint.unclosedParen', { defaultMessage: 'Parenthesis is not closed' });
    case 'clauseOrder':
      return _t('sqlLint.clauseOrder', { defaultMessage: '{clause} must come before {before}', values });
    case 'duplicateClause':
      return _t('sqlLint.duplicateClause', { defaultMessage: '{clause} is used more than once', values });
    case 'missingCondition':
      return _t('sqlLint.missingCondition', { defaultMessage: 'Missing condition after {keyword}', values });
    case 'missingTable':
      return _t('sqlLint.missingTable', { defaultMessage: 'Missing table name after {keyword}', values });
    case 'missingColumns':
      return _t('sqlLint.missingColumns', { defaultMessage: 'Missing column list after SELECT' });
    case 'missingExpression':
      return _t('sqlLint.missingExpression', { defaultMessage: 'Missing expression after {keyword}', values });
    case 'missingAssignment':
      return _t('sqlLint.missingAssignment', { defaultMessage: 'Missing assignments after SET' });
    case 'missingOperand':
      return _t('sqlLint.missingOperand', { defaultMessage: 'Missing value after {operator}', values });
    case 'missingOperandBefore':
      return _t('sqlLint.missingOperandBefore', { defaultMessage: 'Missing value before {operator}', values });
    case 'unexpectedComma':
      return _t('sqlLint.unexpectedComma', { defaultMessage: 'Unexpected comma' });
    case 'missingComma':
      return _t('sqlLint.missingComma', { defaultMessage: 'Missing comma before "{name}"', values });
    case 'expectedParenAfterIn':
      return _t('sqlLint.expectedParenAfterIn', { defaultMessage: 'Expected "(" after IN' });
    case 'unknownKeyword':
      return _t('sqlLint.unknownKeyword', { defaultMessage: 'Unknown keyword "{name}"', values });
    case 'unknownStatement':
      return _t('sqlLint.unknownStatement', { defaultMessage: 'Unknown command "{name}"', values });
    case 'unknownTable':
      return _t('sqlLint.unknownTable', { defaultMessage: 'Table "{name}" does not exist', values });
    case 'unknownColumn':
      return _t('sqlLint.unknownColumn', { defaultMessage: 'Column "{name}" does not exist in "{table}"', values });
    case 'unknownColumnAny':
      return _t('sqlLint.unknownColumnAny', {
        defaultMessage: 'Column "{name}" does not exist in the tables of the query',
        values,
      });
    case 'unknownAlias':
      return _t('sqlLint.unknownAlias', { defaultMessage: 'Unknown table or alias "{name}"', values });
    case 'updateWithoutWhere':
      return _t('sqlLint.updateWithoutWhere', { defaultMessage: 'UPDATE without WHERE changes all rows' });
    case 'deleteWithoutWhere':
      return _t('sqlLint.deleteWithoutWhere', { defaultMessage: 'DELETE without WHERE deletes all rows' });
  }
  return msg.code;
}

function formatMessage(msg: SqlLintMessage) {
  const text = translateMessage(msg);
  if (!msg.suggestion) return text;
  return `${text}. ${_t('sqlLint.didYouMean', { defaultMessage: 'Did you mean "{name}"?', values: { name: msg.suggestion } })}`;
}

/** Checks the SQL in the editor while typing, the found problems are passed to onMessages */
export function mountSqlLinting({ conid, database, engine, editor, getSettings, onMessages }) {
  let dbinfo = null;
  let schemaList = null;
  let driver = null;
  let timer = null;
  let destroyed = false;

  const run = () => {
    timer = null;
    if (destroyed) return;
    const text = editor.getValue();
    if (text.length > MAX_LINTED_LENGTH) {
      onMessages([]);
      return;
    }
    const messages = lintSql(text, {
      dialect: getDatabaseFamily(driver?.engine || engine),
      dbinfo,
      schemaNames: (schemaList || []).map(x => x.schemaName),
      defaultSchema: findDefaultSchema(schemaList || [], driver?.dialect),
      splitByEmptyLine: !getSettings()?.['sqlEditor.disableSplitByEmptyLine'],
      cursorOffset: editor.session.doc.positionToIndex(editor.getCursorPosition()),
    });
    onMessages(
      messages.map(msg => ({
        start: msg.start,
        end: msg.end,
        severity: msg.severity,
        message: formatMessage(msg),
      }))
    );
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, LINT_DELAY);
  };

  editor.on('change', schedule);
  // problems hidden while typing at the end of a statement are shown after the cursor leaves it
  editor.on('changeSelection', schedule);

  const unsubscribers = [];
  if (conid && database) {
    getConnectionInfo({ conid }).then(connection => {
      driver = findEngineDriver(connection, getExtensions());
      schedule();
    });
    unsubscribers.push(
      useDatabaseInfo({ conid, database }).subscribe(value => {
        dbinfo = value;
        schedule();
      }),
      useSchemaList({ conid, database }).subscribe(value => {
        schemaList = value;
        schedule();
      })
    );
  }
  schedule();

  return () => {
    destroyed = true;
    if (timer) clearTimeout(timer);
    editor.off('change', schedule);
    editor.off('changeSelection', schedule);
    for (const unsubscribe of unsubscribers) unsubscribe();
    onMessages([]);
  };
}
