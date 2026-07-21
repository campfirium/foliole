import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.ts';
import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.ts';
import type { CompanionSyncPushPayload } from '../../electron/database/companionSyncPushTypes.ts';
import { applyCompanionStateSyncPushWithDbPort } from '../../electron/database/companionSyncPushWithDbPort.ts';
import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.ts';
import { buildDesktopSyncPackFromDriver } from '../../electron/database/syncPackBuilderFromDriver.ts';
import { initializeDatabaseConnection } from '../../lib/core/database/migrations.ts';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.ts';

import { writeIllegalDagPack, writeLegacyFormatPack } from './ios-sync-pack-acceptance-mutations.ts';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
const DESKTOP_DEVICE_ID = 'acceptance-desktop';
const RESTORE_NODE_ID = 'ios-acceptance-restore';

export async function createIosSyncPackAcceptanceFixture(args: {
  outputDirectory: string;
  toPeerId: string;
}) {
  await fs.mkdir(args.outputDirectory, { recursive: true });
  const databasePath = path.join(args.outputDirectory, 'desktop.sqlite');
  await fs.rm(databasePath, { force: true });
  const sqlite = new BetterSqlite3(databasePath);
  const driver = createBetterSqlite3Driver(sqlite);
  initializeDatabaseConnection({ driver, sqlite });
  seedRoundtripNodes(driver);
  const paths = fixturePaths(args.outputDirectory);
  await buildPack(driver, paths.legalPath, args.toPeerId, 0, 'ios-acceptance-legal');
  await buildPack(driver, paths.wrongTargetPath, `${args.toPeerId}-wrong`, 0, 'ios-acceptance-wrong-target');
  await buildCursorGapPack(driver, paths.cursorGapPath, args.toPeerId);
  await writeCorruptEnvelope(paths.legalPath, paths.corruptEnvelopePath);
  await writeLegacyFormatPack(paths.legalPath, paths.legacyFormatPath);
  await writeIllegalDagPack(paths.legalPath, paths.illegalDagPath);
  markInitialPackAcknowledged(driver);
  const port = createBetterSqliteDbPort(sqlite, { name: 'ios-node-version-roundtrip-acceptance' });
  return {
    ...paths,
    apply: (items: CompanionSyncPushPayload[]) => applyCompanionStateSyncPushWithDbPort(port, items),
    buildSuccessorPack: async (appliedNodeIds: string[]) => {
      const captureNodeId = appliedNodeIds.find((nodeId) => nodeId !== RESTORE_NODE_ID);
      if (!captureNodeId || !appliedNodeIds.includes(RESTORE_NODE_ID)) {
        throw new Error('ios_node_version_roundtrip_push_incomplete');
      }
      createDesktopSuccessor(driver, captureNodeId);
      await buildPack(driver, paths.successorPath, args.toPeerId, 2, 'ios-acceptance-successor');
      await buildIllegalDagRejectionPack(driver, paths.illegalDagPath, args.toPeerId);
      return { captureNodeId, desktop: readDesktopRoundtripSnapshot(sqlite, captureNodeId) };
    },
    close: () => sqlite.close()
  };
}

async function buildIllegalDagRejectionPack(
  driver: ReturnType<typeof createBetterSqlite3Driver>,
  outputPath: string,
  toPeerId: string
) {
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, sync_dirty, created_at, updated_at)
     VALUES ('ios-acceptance-illegal-dag', 'topic', 'Illegal DAG', '', 1, ?, ?)`,
    ['2026-07-21T00:05:00.000Z', '2026-07-21T00:05:00.000Z']
  );
  flushNodeSyncVersionWithDriver(
    driver, 'ios-acceptance-illegal-dag', DESKTOP_DEVICE_ID, '2026-07-21T00:05:00.000Z'
  );
  await buildPack(driver, outputPath, toPeerId, 5, 'ios-acceptance-illegal-dag');
  await writeIllegalDagPack(outputPath, outputPath, 'ios-acceptance-illegal-dag');
}

function markInitialPackAcknowledged(driver: ReturnType<typeof createBetterSqlite3Driver>) {
  driver.execute(
    `UPDATE nodes SET sync_dirty = 0 WHERE id IN (?, ?)`,
    [INBOX_NODE_ID, RESTORE_NODE_ID]
  );
  driver.execute(
    `UPDATE sync_object_state SET sync_dirty = 0 WHERE object_type = 'node' AND object_id IN (?, ?)`,
    [INBOX_NODE_ID, RESTORE_NODE_ID]
  );
}

function seedRoundtripNodes(driver: ReturnType<typeof createBetterSqlite3Driver>) {
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, sync_dirty, created_at, updated_at)
     VALUES (?, 'folder', 'Inbox', '', 1, ?, ?)`,
    [INBOX_NODE_ID, '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, sync_dirty, created_at, updated_at, deleted_at)
     VALUES (?, 'topic', 'Trashed acceptance', 'Restore body', 1, ?, ?, ?)`,
    [RESTORE_NODE_ID, '2026-07-21T00:00:10.000Z', '2026-07-21T00:00:20.000Z', '2026-07-21T00:00:20.000Z']
  );
  flushNodeSyncVersionWithDriver(driver, INBOX_NODE_ID, DESKTOP_DEVICE_ID, '2026-07-21T00:00:00.000Z');
  flushNodeSyncVersionWithDriver(driver, RESTORE_NODE_ID, DESKTOP_DEVICE_ID, '2026-07-21T00:00:20.000Z');
}

function createDesktopSuccessor(driver: ReturnType<typeof createBetterSqlite3Driver>, nodeId: string) {
  driver.execute(
    `UPDATE nodes SET title = 'Mac successor acceptance', content = 'Mac successor body',
       sync_dirty = 1, updated_at = '2099-07-21T00:04:00.000Z' WHERE id = ?`,
    [nodeId]
  );
  const versionId = flushNodeSyncVersionWithDriver(
    driver, nodeId, DESKTOP_DEVICE_ID, '2099-07-21T00:04:00.000Z'
  );
  if (!versionId) throw new Error('ios_node_version_roundtrip_successor_missing');
}

async function buildCursorGapPack(
  driver: ReturnType<typeof createBetterSqlite3Driver>,
  outputPath: string,
  toPeerId: string
) {
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('ios-acceptance-gap-node', 'topic', 'Gap Topic', '', ?, ?)`,
    ['2026-07-21T00:02:00.000Z', '2026-07-21T00:02:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'ios-acceptance-gap-node', 7, 'ios-acceptance-gap-hash',
       ?, '2026-07-21T00:02:00.000Z', 1)`,
    [DESKTOP_DEVICE_ID]
  );
  await buildPack(driver, outputPath, toPeerId, 6, 'ios-acceptance-cursor-gap');
  driver.execute("DELETE FROM sync_object_state WHERE object_id = 'ios-acceptance-gap-node'");
  driver.execute("DELETE FROM nodes WHERE id = 'ios-acceptance-gap-node'");
}

async function buildPack(
  driver: ReturnType<typeof createBetterSqlite3Driver>,
  outputPath: string,
  toPeerId: string,
  fromStateSeq: number,
  packId: string
) {
  await buildDesktopSyncPackFromDriver({
    createdAt: '2026-07-21T00:01:00.000Z',
    fromDeviceId: DESKTOP_DEVICE_ID,
    fromStateSeq,
    outputPath,
    packId,
    toPeerId
  }, driver);
}

function fixturePaths(outputDirectory: string) {
  return {
    corruptEnvelopePath: path.join(outputDirectory, 'corrupt-envelope.syncpack'),
    cursorGapPath: path.join(outputDirectory, 'cursor-gap.syncpack'),
    illegalDagPath: path.join(outputDirectory, 'illegal-dag.syncpack'),
    legacyFormatPath: path.join(outputDirectory, 'legacy-format.syncpack'),
    legalPath: path.join(outputDirectory, 'legal.syncpack'),
    successorPath: path.join(outputDirectory, 'successor.syncpack'),
    wrongTargetPath: path.join(outputDirectory, 'wrong-target.syncpack')
  };
}

function readDesktopRoundtripSnapshot(sqlite: import('better-sqlite3').Database, captureNodeId: string) {
  return {
    capture_current: sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get(captureNodeId),
    capture_versions: sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions WHERE object_id = ?').pluck().get(captureNodeId),
    restore_current: sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get(RESTORE_NODE_ID),
    restore_versions: sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions WHERE object_id = ?').pluck().get(RESTORE_NODE_ID)
  };
}

async function writeCorruptEnvelope(sourcePath: string, outputPath: string) {
  const bytes = Buffer.from(await fs.readFile(sourcePath));
  bytes[0] = bytes[0] ^ 0xff;
  await fs.writeFile(outputPath, bytes);
}
