import _ from 'lodash';
import type { QueryResultColumn } from 'dbgate-types';
import { ChangeSet, createChangeSet } from './ChangeSet';

export function createQueryResultSaveChangeSet(changeSet: ChangeSet, structure: { columns?: QueryResultColumn[] }) {
  const res = createChangeSet();
  const columnMap = _.keyBy(
    (structure?.columns || []).filter(column => column.tableName && column.sourceColumnName),
    'columnName'
  );

  res.updates = (changeSet?.updates || [])
    .map(update => {
      const fields = {};
      for (const fieldName of Object.keys(update.fields || {})) {
        const column = columnMap[fieldName];
        if (!column) continue;
        fields[column.sourceColumnName] = update.fields[fieldName];
      }
      if (_.isEmpty(fields)) return null;
      return {
        pureName: update.pureName,
        schemaName: update.schemaName,
        condition: update.condition,
        fields,
      };
    })
    .filter(Boolean);

  return res;
}

export interface QueryResultRowUpdate {
  // result column name -> original value of the key column
  match: { [columnName: string]: any };
  // result column name -> new value
  set: { [columnName: string]: any };
}

function namesEqual(left: string, right: string) {
  return left != null && right != null && left.toLowerCase() == right.toLowerCase();
}

// Translates saved query result changes into updates of the result rows themselves,
// so the displayed result reflects the saved values without executing the query again
export function createQueryResultRowUpdates(
  changeSet: ChangeSet,
  structure: { columns?: QueryResultColumn[] }
): QueryResultRowUpdate[] {
  const columns = (structure?.columns || []).filter(column => column.tableName && column.sourceColumnName);
  const columnMap = _.keyBy(columns, 'columnName');
  const findResultColumns = (pureName: string, sourceColumnName: string) =>
    columns.filter(
      column => namesEqual(column.tableName, pureName) && namesEqual(column.sourceColumnName, sourceColumnName)
    );

  return (changeSet?.updates || [])
    .map(update => {
      const match = {};
      for (const [sourceColumnName, value] of Object.entries(update.condition || {})) {
        const keyColumn = findResultColumns(update.pureName, sourceColumnName)[0];
        if (!keyColumn) return null;
        match[keyColumn.columnName] = value;
      }
      const set = {};
      for (const fieldName of Object.keys(update.fields || {})) {
        const column = columnMap[fieldName];
        if (!column) continue;
        // the same source column can be selected more than once
        for (const resultColumn of findResultColumns(column.tableName, column.sourceColumnName)) {
          set[resultColumn.columnName] = update.fields[fieldName];
        }
      }
      if (_.isEmpty(match) || _.isEmpty(set)) return null;
      return { match, set };
    })
    .filter(Boolean);
}
