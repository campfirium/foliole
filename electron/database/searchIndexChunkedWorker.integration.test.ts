// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { claimSearchIndexInvalidations, completeInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';
import { rebuildWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { markWorkspaceSearchSourceRevisionQueued } from '../../lib/core/database/workspaceSearchSourceState.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyVerifiedDesktopFramedSyncInbound } from '../sync/desktopFramedSyncVerifiedApply.js';
import { verifiedDesktopReadyFixture } from '../sync/desktopFramedSyncVerifiedApply.testSupport.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { runSourceSearchWorker, searchMatches, searchRows } from './searchIndexChunkedWorker.testSupport.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const now = '2026-10-07T00:00:00.000Z';

it.each(['incremental', 'rebuild'] as const)('indexes owned bodies after staging cleanup and restart through %s work', async (kind) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'foliole-chunked-search-'));
  const dbPath = path.join(directory, 'library.db');
  const searchDbPath = path.join(directory, 'search.db');
  const body = '\ufeff中文 needle😀\0后段\n'.repeat(30000);
  const old = textDevice();
  const host = await verifiedDesktopReadyFixture(body);
  let reopened: Database.Database | undefined;
  try {
    old.sqlite.exec("ATTACH DATABASE ':memory:' AS search");
    await applySyncNodesWithDbPort(old.db, [textBranch('version', body, undefined, now)]);
    expect(rebuildWorkspaceSearchSidecar({ sqlite: old.sqlite, driver: createBetterSqlite3Driver(old.sqlite) },
      { strategy: 'word-based' }).status).toBe('ready');
    const expected = searchRows(old.sqlite);
    host.sqlite.prepare('ATTACH DATABASE ? AS search').run(searchDbPath);
    expect(rebuildWorkspaceSearchSidecar({ sqlite: host.sqlite, driver: createBetterSqlite3Driver(host.sqlite) },
      { strategy: 'word-based' }).status).toBe('ready');
    await applyVerifiedDesktopFramedSyncInbound({ db: host.db, transfers: [host.transfer] });
    expect(host.sqlite.prepare('SELECT count(*) FROM search_index_invalidations').pluck().get()).toBeGreaterThan(0);
    expect(searchRows(host.sqlite)).toEqual([]);
    await host.staging.releasePins(host.published.transferId, 'business_reference_committed');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_inbound_attempts').pluck().get()).toBe(0);
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blobs').pluck().get()).toBe(0);
    await host.sqlite.backup(dbPath);
    host.sqlite.close();
    reopened = new Database(dbPath);
    reopened.prepare('ATTACH DATABASE ? AS search').run(searchDbPath);
    const driver = createBetterSqlite3Driver(reopened);
    const pending = reopened.prepare('SELECT id, target_id FROM search_index_invalidations').all();
    expect(pending.length).toBeGreaterThan(0);
    const rows = claimSearchIndexInvalidations(driver);
    const work = kind === 'incremental' ? { rows } : {
      strategy: 'word-based' as const, source: markWorkspaceSearchSourceRevisionQueued(driver)
    };
    await runSourceSearchWorker({ ...work, dbPath, searchDbPath });
    expect(searchRows(reopened)).toEqual(expected);
    for (const term of ['中文', 'needle', '后段']) expect(searchMatches(reopened, term)).toEqual(searchMatches(old.sqlite, term));
    expect(reopened.prepare('SELECT id,target_id FROM search_index_invalidations').all()).toEqual(pending);
    completeInvalidations(driver, rows.map((row) => row.id));
    expect(reopened.prepare('SELECT count(*) FROM search_index_invalidations').pluck().get()).toBe(0);
  } finally {
    reopened?.close();
    if (host.sqlite.open) host.sqlite.close();
    old.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
