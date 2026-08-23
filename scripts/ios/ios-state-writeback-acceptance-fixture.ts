import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.ts';
import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.ts';
import type { CompanionSyncPushPayload } from '../../electron/database/companionSyncPushTypes.ts';
import { applyCompanionStateSyncPushWithDbPort } from '../../electron/database/companionSyncPushWithDbPort.ts';
import { buildDesktopSyncPackFromDriver } from '../../electron/database/syncPackBuilderFromDriver.ts';
import { initializeDatabaseConnection } from '../../lib/core/database/migrations.ts';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export type IosStateWritebackAcceptanceFixture = Awaited<ReturnType<typeof createIosStateWritebackAcceptanceFixture>>;

export async function createIosStateWritebackAcceptanceFixture(args: {
  outputDirectory: string;
  toPeerId: string;
}) {
  await fs.mkdir(args.outputDirectory, { recursive: true });
  const databasePath = path.join(args.outputDirectory, 'desktop.sqlite');
  await fs.rm(databasePath, { force: true });
  const sqlite = new BetterSqlite3(databasePath);
  const driver = createBetterSqlite3Driver(sqlite);
  initializeDatabaseConnection({ driver, sqlite });
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('ios-state-node', 'topic', 'State acceptance', '', ?, ?)`,
    ['2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node', 'ios-state-node', 1, 'ios-state-node-hash',
       'acceptance-desktop', '2026-07-21T00:00:00.000Z', 1)`
  );
  const port = createBetterSqliteDbPort(sqlite, { name: 'ios-state-writeback-acceptance' });
  return {
    apply: (items: CompanionSyncPushPayload[], sourceDeviceId: string) =>
      applyCompanionStateSyncPushWithDbPort(port, items, sourceDeviceId),
    buildConfirmationPack: async (fromStateSeq = 0) => {
      const outputPath = path.join(args.outputDirectory, `confirmation-${fromStateSeq}.syncpack`);
      await buildDesktopSyncPackFromDriver({
        createdAt: '2026-07-21T00:02:00.000Z',
        fromPeerId: 'acceptance-desktop',
        fromStateSeq,
        outputPath,
        packId: 'ios-state-writeback-confirmation',
        toPeerId: args.toPeerId
      }, driver);
      return outputPath;
    },
    close: () => sqlite.close(),
    databasePath,
    driver,
    loadMaxStateSeq: () => Number(driver.queryOne<{ max_state_seq: number }>(
      'SELECT COALESCE(MAX(state_seq), 0) AS max_state_seq FROM sync_object_state'
    )?.max_state_seq ?? 0)
  };
}
