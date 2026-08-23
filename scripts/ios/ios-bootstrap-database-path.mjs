import path from 'node:path';

export function resolveAcceptanceDatabasePath(containerPath, result) {
  const containerRoot = path.resolve(containerPath);
  const databasePath = typeof result?.database_path === 'string' ? path.resolve(result.database_path) : '';
  if (!databasePath.startsWith(`${containerRoot}${path.sep}`)) {
    throw new Error('iOS acceptance did not publish a confined runtime database path.');
  }
  return databasePath;
}
