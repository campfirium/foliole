import type { DesktopSession } from './harness/fixtures';

// Seeded fixtures must prepare their first Flow from the complete initial dataset.
export async function resetSeededDailyFlow(app: DesktopSession['electronApp']) {
  await app.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver.transaction((driver: { execute(sql: string): void }) => {
      for (const table of ['daily_flow_entries', 'daily_flow_state', 'daily_flow_operations']) driver.execute(`DELETE FROM ${table}`);
    }));
  });
}
