// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => { for (const device of devices.splice(0)) device.sqlite.close(); });

it('changes the owning node summary when an open state changes without a separate inventory entry', async () => {
  const device = textDevice(); devices.push(device);
  await device.receive([textBranch('base', 'Original')]);
  const before = await readFramedSyncInventory(device.db);
  const payload = { node_id: 'topic', last_opened_at: '2026-10-16T01:00:00.000Z' };
  await applySyncObjectInTransaction(device.db, { object_type: 'node_open_state', object_id: 'topic',
    content_hash: computeSyncContentHash('node_open_state', payload), deleted_at: null,
    payload_json: JSON.stringify(payload), updated_at: payload.last_opened_at });
  const after = await readFramedSyncInventory(device.db);
  expect(after.filter(entry => entry.objectType === 'node_open_state')).toEqual([]);
  expect(after.find(entry => entry.globalId === 'topic' && entry.objectType === 'node')?.sharedStateHash)
    .not.toEqual(before.find(entry => entry.globalId === 'topic' && entry.objectType === 'node')?.sharedStateHash);
  expect((await device.current()).body_text).toBe('Original');
});

it('keeps child tombstones with their node and keeps ownerless tombstones independently', async () => {
  const device = textDevice(); devices.push(device);
  await device.receive([textBranch('base', 'Original')]);
  for (const id of ['topic', 'missing']) await applySyncObjectInTransaction(device.db, {
    object_type: 'node_reading', object_id: id, content_hash: 'a'.repeat(64),
    deleted_at: '2026-10-16T02:00:00.000Z', updated_at: '2026-10-16T02:00:00.000Z', payload_json: null
  });
  const entries = await readFramedSyncInventory(device.db);
  expect(entries.filter(entry => entry.objectType === 'node_reading').map(entry => entry.globalId)).toEqual(['missing']);
  expect(entries.find(entry => entry.objectType === 'node' && entry.globalId === 'topic')?.stateFactIds)
    .toContain(JSON.stringify(['node_reading', 'topic', 'a'.repeat(64)]));
});

it('advertises import facts independently when the latest note changes or is absent', async () => {
  const device = textDevice(); devices.push(device);
  await device.receive([textBranch('base', 'Original')]);
  for (const [index, owner] of ['topic', 'absent', 'topic'].entries()) {
    await applySyncObjectInTransaction(device.db, { object_type: 'import_source', object_id: 'source',
      content_hash: String(index + 1).repeat(64), deleted_at: null,
      updated_at: `2026-10-16T0${index}:00:00.000Z`, payload_json: JSON.stringify({ latest_node_id: owner }) });
    const entries = await readFramedSyncInventory(device.db);
    expect(entries.find(entry => entry.objectType === 'import_source')).toMatchObject({ globalId: 'source' });
    const childFacts = entries.find(entry => entry.objectType === 'node' && entry.globalId === 'topic')?.stateFactIds;
    expect(childFacts).toEqual([]);
    expect(device.sqlite.prepare('SELECT latest_node_id FROM import_sources WHERE source_fingerprint = ?').get('source'))
      .toEqual({ latest_node_id: owner });
  }
});

it('relays the same independent import deletion through repeat transfers without a node owner', async () => {
  const { applyFramedSyncObjectStateRecord, restoreFramedSyncObjectStateFact, selectFramedSyncObjectStateFact }
    = await import('../../lib/core/sync/framedSyncObjectStateFact.js');
  const left = textDevice(); const right = textDevice(); devices.push(left, right);
  const hash = 'a'.repeat(64);
  const time = '2026-10-16';
  await applySyncObjectInTransaction(left.db, { object_type: 'import_source', object_id: 'source',
    content_hash: hash, deleted_at: time, updated_at: time, payload_json: null });
  const fact = await selectFramedSyncObjectStateFact(left.db,
    { objectType: 'import_source', globalId: 'source' }, `import_source:${hash}`);
  for (let attempt = 0; attempt < 2; attempt++) {
    await applyFramedSyncObjectStateRecord(right.db, restoreFramedSyncObjectStateFact(fact));
  }
  for (const device of [left, right]) {
    expect(await device.db.query('SELECT * FROM sync_node_child_owners')).toEqual([]);
    expect(await device.db.query('SELECT content_hash, deleted_at FROM sync_object_state'))
      .toEqual([{ content_hash: hash, deleted_at: time }]);
  }
});
