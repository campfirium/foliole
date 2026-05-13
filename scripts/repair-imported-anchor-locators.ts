import { closeDatabaseConnection, openDatabaseConnection } from '../electron/database/connection.ts';
import { repairImportedAnchorLocators } from '../lib/core/database/importedAnchorLocatorRepair.ts';

function readArgValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main() {
  const write = process.argv.includes('--write');
  const parentNodeId = readArgValue('--parent-node-id');
  const connection = openDatabaseConnection();
  const result = repairImportedAnchorLocators({
    driver: connection.driver,
    parentNodeId,
    repairedAt: new Date().toISOString(),
    write
  });
  console.log(JSON.stringify({
    mode: write ? 'write' : 'dry-run',
    repairedCount: result.repairedNodeIds.length,
    repairedNodeIds: result.repairedNodeIds,
    skipped: result.skipped
  }, null, 2));
}

try {
  main();
} finally {
  closeDatabaseConnection();
}
