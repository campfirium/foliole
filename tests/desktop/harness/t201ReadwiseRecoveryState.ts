import type { ElectronApplication } from '@playwright/test';

import { expect } from './fixtures';

export async function expectT201StartupRequest(app: ElectronApplication) {
  try {
    await expect.poll(() => app.evaluate(() => Boolean(
      (globalThis as typeof globalThis & { __t201FailedRequest?: boolean }).__t201FailedRequest
    ))).toBe(true);
  } catch (error) {
    console.log('Readwise startup diagnostics', await app.evaluate(async () => {
      const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
      const load = (name: string) => require(`${process.cwd()}/dist/electron/${name}.js`);
      const state = await load('database/connection').runWithDatabaseConnectionOwner(() => ({
        status: load('import/readwiseApiScheduler').loadReadwiseApiScheduleStatus(),
        journal: load('database/readwiseSourceCutover').loadReadwiseSourceCutover(),
        connection: load('import/readwiseApiConnectionState').toPublicReadwiseApiConnection(),
        host: load('database/readwiseHostAssignment').loadReadwiseHostAssignment()
      }));
      return JSON.stringify(state);
    }));
    throw error;
  }
}

export function readT201RecoveryState(app: ElectronApplication) {
  return app.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const load = (name: string) => require(`${process.cwd()}/dist/electron/${name}.js`);
    return load('database/connection').runWithDatabaseConnectionOwner(() => {
      const driver = load('database/connection').openDatabaseConnection().driver;
      return {
        journal: load('database/readwiseSourceCutover').loadReadwiseSourceCutover(),
        nodes: driver.queryAll(`SELECT id,parent_id,content FROM nodes
          WHERE id IN ('legacy-topic','local-highlight') ORDER BY id`),
        identities: driver.queryAll(`SELECT latest_node_id,remote_document_id FROM import_sources
          WHERE remote_provider='readwise' AND remote_document_id='remote-document'`)
      };
    });
  });
}
