import type { DesktopSession } from './fixtures';

// Fixture construction must precede generation; ordinary writes intentionally do not rebuild a saved list.
export function resetDailyFlowGeneration(app: DesktopSession['electronApp']) {
  return app.evaluate(async () => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    await connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver.transaction((driver: { execute(sql: string): void }) => {
      for (const table of ['daily_flow_entries', 'daily_flow_state', 'daily_flow_operations']) driver.execute(`DELETE FROM ${table}`);
    }));
  });
}
