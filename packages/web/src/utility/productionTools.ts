/** Connection marked as production as a whole, or just this database of it */
export function isProductionDatabase(connection, database = null) {
  if (!connection) return false;
  if (connection.isProduction) return true;
  return !!database && !!connection.databases?.find(x => x.name == database)?.isProduction;
}
