// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { computeSyncContentHash } from '../../../../../../lib/core/database/syncState.js';
import { applySyncObjectInTransaction } from '../../../../../../lib/core/sync/syncObjectApplyExecutor.js';
import { createCompanionRequestFixture } from '../../../../../test/companionRequestSync.testSupport.js';

it('persists received time without a tree reload and still invalidates the tree for received text', { meta: { calibratedMs: 30_000 } }, async () => {
  const host = await createCompanionRequestFixture();
  try {
    await host.sync();
    const sourceId = '22222222-2222-4222-8222-222222222222';
    const payload = { source_id: sourceId, days: { '2026-10-16': 60_000 } };
    const source = new Database(host.fixture.rightSnapshot.databasePath);
    try {
      await createBetterSqliteDbPort(source).transaction(tx => applySyncObjectInTransaction(tx, {
        object_type: 'foreground_source', object_id: sourceId, deleted_at: null,
        payload_json: JSON.stringify(payload), content_hash: computeSyncContentHash('foreground_source', payload),
        updated_at: '2026-10-16T00:00:00.000Z'
      }));
    } finally { source.close(); }
    const onStructureSynced = vi.fn();
    expect(await host.sync({ onStructureSynced })).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(host.sqlite.prepare('SELECT duration_ms FROM foreground_daily_time WHERE source_id = ?')
      .pluck().get(sourceId)).toBe(60_000);
    expect(onStructureSynced).toHaveBeenLastCalledWith({ receivedCount: 1, workspaceChanged: false });
    await host.fixture.right.seed({ nodeId: 'visible-edit', title: 'Visible edit', content: 'Remote text' });
    expect(await host.sync({ onStructureSynced })).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(onStructureSynced).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceChanged: true }));
    expect(host.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('visible-edit')).toBe('Remote text');
    await host.restart();
    expect(host.sqlite.prepare('SELECT duration_ms FROM foreground_daily_time WHERE source_id = ?')
      .pluck().get(sourceId)).toBe(60_000);
  } finally { await host.close(); }
});
