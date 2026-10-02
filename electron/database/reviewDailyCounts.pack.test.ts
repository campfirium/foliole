// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { recordTopicDailyCount } from '../../lib/core/database/reviewDailyCounts.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';
import { readStoredZipEntries } from './syncPackZipReaderTestSupport.js';

it('transfers retained daily counts in a production sync pack without duplicating existing objects', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-calendar-pack-'));
  const source = new Database(':memory:');
  const target = new Database(path.join(root, 'target.db'));
  try {
    for (const db of [source, target]) for (const sql of DESKTOP_FRESH_SCHEMA_STATEMENTS) db.exec(sql);
    const driver = createBetterSqlite3Driver(source);
    for (const nodeId of ['topic-a', 'topic-b']) recordTopicDailyCount(driver, {
      day: '2026-10-02', nodeId, hostName: 'source'
    });
    recordTopicDailyCount(createBetterSqlite3Driver(target), {
      day: '2026-10-02', nodeId: 'topic-a', hostName: 'target'
    });
    const outputPath = path.join(root, 'pack.zip');
    await buildDesktopSyncPackFromDriver({ outputPath, packId: 'calendar-pack', fromPeerId: 'source', fromStateSeq: 0 }, driver);
    const incoming = path.join(root, 'incoming.db');
    writeFileSync(incoming, inflateSync(readStoredZipEntries(outputPath).get('incoming.db.deflate')!));
    target.prepare('ATTACH DATABASE ? AS inc').run(incoming);
    const port = createBetterSqliteDbPort(target);
    for (let replay = 0; replay < 2; replay += 1) {
      await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0, hostName: 'target', enqueueSearchInvalidations: false });
    }
    target.exec('DETACH DATABASE inc');
    expect(target.prepare('SELECT day_key, count FROM topic_daily_counts').all())
      .toEqual([{ day_key: '2026-10-02', count: 2 }]);
  } finally {
    source.close(); target.close(); rmSync(root, { recursive: true, force: true });
  }
});
