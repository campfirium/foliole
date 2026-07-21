import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.ts';
import { buildDesktopSyncPackFromDriver } from '../../electron/database/syncPackBuilderFromDriver.ts';
import { initializeDatabaseConnection } from '../../lib/core/database/migrations.ts';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export interface IosSyncPackAcceptanceFixture {
  corruptEnvelopePath: string;
  cursorGapPath: string;
  legalPath: string;
  wrongTargetPath: string;
}

export async function createIosSyncPackAcceptanceFixture(args: {
  outputDirectory: string;
  toPeerId: string;
}): Promise<IosSyncPackAcceptanceFixture> {
  await fs.mkdir(args.outputDirectory, { recursive: true });
  const sqlite = new BetterSqlite3(':memory:');
  const driver = createBetterSqlite3Driver(sqlite);
  initializeDatabaseConnection({ driver, sqlite });
  insertAcceptanceNode(driver);
  const paths = fixturePaths(args.outputDirectory);
  try {
    await buildPack(driver, paths.legalPath, args.toPeerId, 0, 'ios-acceptance-legal');
    await buildPack(driver, paths.wrongTargetPath, `${args.toPeerId}-wrong`, 0, 'ios-acceptance-wrong-target');
    await buildPack(driver, paths.cursorGapPath, args.toPeerId, 1, 'ios-acceptance-cursor-gap');
    await writeCorruptEnvelope(paths.legalPath, paths.corruptEnvelopePath);
    return paths;
  } finally {
    sqlite.close();
  }
}

function insertAcceptanceNode(driver: ReturnType<typeof createBetterSqlite3Driver>) {
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('ios-acceptance-node', 'topic', 'Acceptance Topic', '', ?, ?)`,
    ['2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'ios-acceptance-node', 2, 'ios-acceptance-hash',
       'acceptance-desktop', '2026-07-21T00:00:00.000Z', 1)`
  );
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
    fromDeviceId: 'acceptance-desktop',
    fromStateSeq,
    outputPath,
    packId,
    toPeerId
  }, driver);
}

function fixturePaths(outputDirectory: string): IosSyncPackAcceptanceFixture {
  return {
    corruptEnvelopePath: path.join(outputDirectory, 'corrupt-envelope.syncpack'),
    cursorGapPath: path.join(outputDirectory, 'cursor-gap.syncpack'),
    legalPath: path.join(outputDirectory, 'legal.syncpack'),
    wrongTargetPath: path.join(outputDirectory, 'wrong-target.syncpack')
  };
}

async function writeCorruptEnvelope(sourcePath: string, outputPath: string) {
  const bytes = Buffer.from(await fs.readFile(sourcePath));
  bytes[0] = bytes[0] ^ 0xff;
  await fs.writeFile(outputPath, bytes);
}
