// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';
import { firstAt } from './reviewProjection.testSupport.js';

const reading = { intervalDurationMs: 86_400_000, intervalGrowthFactor: 2, lastHandledAt: firstAt, nextAt: firstAt,
  priority: 50, readingPosition: 0, repetitionCount: 4, state: 'active' as const };

it.each(['desktop', 'companion'])('adds the reading history order without touching existing progress during the %s upgrade', async host => {
  const fixture = await restoreFixture();
  const peer = fixture.peer('source');
  try {
    peer.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING')
      .run('host_name', JSON.stringify(peer.id), firstAt);
    const driver = createBetterSqlite3Driver(peer.sqlite);
    bindParentOrderWriter(driver, { deviceAnchor: peer.id, libraryPath: peer.file });
    upsertNodeSnapshot(driver, { nodeId: 'topic', kind: 'topic', parentNodeId: null, title: 'topic', content: 'Read this',
      reveal: null, anchorLink: null, isTitleManual: true, position: null, createdAt: firstAt, updatedAt: firstAt });
    saveNodeReadingStateWithSync(driver, { nodeId: 'topic', hostName: peer.id, reading, updatedAt: firstAt });
    peer.sqlite.exec(`ALTER TABLE node_reading DROP COLUMN history_order_at; PRAGMA user_version = ${host === 'desktop' ? 202 : 126}`);
    if (host === 'desktop') initializeDatabaseSchema(peer.sqlite);
    else await peer.db.transaction(db => migrateCompanionDatabase(db, 126, 127));
    peer.reopen();
    expect(peer.sqlite.prepare("SELECT repetition_count, history_order_at FROM node_reading WHERE node_id = 'topic'").get())
      .toEqual({ repetition_count: 4, history_order_at: null });
  } finally { await fixture.close(); }
});
