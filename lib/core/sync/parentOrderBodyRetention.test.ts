import { expect, it } from 'vitest';

import { port, setupVersionCollectionFixture, sqlite } from '../../../electron/database/nodeVersionPayloadCollector.testSupport.js';

import { applyVersionMemberPosition } from './nodeVersionMemberPositionApply.js';
import { nodePositionFactId, type NodePositionPayload } from './nodeVersionMemberPositionFact.js';
import { collectParentOrderBodies } from './parentOrderBodyRetention.js';
import { publishParentOrderPosition } from './parentOrderMemberPosition.js';
import { hashText } from './syncNodeResolution.js';
import { parentOrderFactPayload } from './syncParentOrderFact.js';
import { applyParentOrderFactObject } from './syncParentOrderFactApply.js';
import { readParentOrderResolutionHistory, readParentOrderResolutionSnapshots } from './syncParentOrderResolutionRead.js';
import { advanceParentOrderHead, insertParentOrderVersion } from './syncParentOrderVersionStore.js';

setupVersionCollectionFixture();

async function chain() {
  for (const [index, id] of ['oa', 'ob', 'oc', 'od'].entries()) {
    await insertParentOrderVersion(port, 'folder', { versionId: id, kind: index ? 'membership' : 'baseline',
      order: ['a', 'b'], parentVersionIds: index ? [['oa', 'ob', 'oc'][index - 1]!] : [] }, 'now');
  }
  await advanceParentOrderHead(port, 'folder', 'od');
}
function body(id: string) {
  return sqlite.prepare('SELECT child_ids_json FROM parent_order_versions WHERE version_id = ?').pluck().get(id);
}
function position(overrides: Partial<NodePositionPayload> = {}): NodePositionPayload {
  return { adopted_version_id: 'ob', device_identity_key: 'remote', group_id: 'group',
    library_epoch: 'original-epoch', object_id: 'folder', pending_version_ids_json: '[]',
    proof_revision: 4, updated_at: 'now', ...overrides };
}
async function adopt(payload: NodePositionPayload) {
  return applyVersionMemberPosition(port, { object_type: 'parent_order_position',
    object_id: nodePositionFactId(payload, 'parent_child_order'),
    content_hash: hashText(JSON.stringify(payload)), payload_json: JSON.stringify(payload),
    deleted_at: null, updated_at: payload.updated_at }, 'parent_child_order');
}

it('protects an unknown offline member, then releases only bodies outside its adopted position', async () => {
  await chain();
  expect((await collectParentOrderBodies(port, 'folder')).released).toBe(0);
  await adopt(position());
  await collectParentOrderBodies(port, 'folder');
  expect(body('oa')).toBe('null');
  expect(body('ob')).toBe('["a","b"]');
  expect(body('oc')).toBe('null');
  expect(body('od')).toBe('["a","b"]');
  expect((await collectParentOrderBodies(port, 'folder')).released).toBe(0);
});

it('retains a true sibling base and valid losing arrangements through collection', async () => {
  await chain();
  await insertParentOrderVersion(port, 'folder', { versionId: 'fork', kind: 'user',
    order: ['b', 'a'], parentVersionIds: ['ob'] }, 'now');
  await adopt(position({ adopted_version_id: 'fork' }));
  await collectParentOrderBodies(port, 'folder');
  expect(body('ob')).toBe('["a","b"]');
  expect(body('fork')).toBe('["b","a"]');
  const history = await readParentOrderResolutionHistory(port, 'folder', ['od', 'fork']);
  const snapshots = await readParentOrderResolutionSnapshots(port, history, ['od', 'fork']);
  expect(snapshots.versions.get('ob')?.order).toEqual(['a', 'b']);
});

it('keeps unresolved exit positions until all live pending tips absorb them', async () => {
  await chain();
  await adopt(position());
  sqlite.exec("UPDATE sync_group_devices SET state = 'left' WHERE device_identity_key = 'remote'");
  await insertParentOrderVersion(port, 'folder', { versionId: 'fork', kind: 'membership',
    order: ['a', 'b'], parentVersionIds: ['oa'] }, 'now');
  await collectParentOrderBodies(port, 'folder');
  expect(body('ob')).not.toBe('null');
  await insertParentOrderVersion(port, 'folder', { versionId: 'merged', kind: 'merge',
    order: ['a', 'b'], parentVersionIds: ['od', 'fork'] }, 'now');
  await advanceParentOrderHead(port, 'folder', 'merged');
  await collectParentOrderBodies(port, 'folder');
  const resolved = sqlite.prepare('SELECT resolved_revision FROM parent_order_member_positions').pluck().get();
  expect(resolved).toBe(4);
  expect(await adopt(position())).toBe(false);
});

it('refuses incomplete adoption and retains a newer original declaration when an older relay arrives', async () => {
  await chain();
  await publishParentOrderPosition(port, 'folder');
  const local = sqlite.prepare("SELECT * FROM parent_order_member_positions WHERE device_identity_key = 'local'").get();
  await insertParentOrderVersion(port, 'folder', { versionId: 'incomplete', kind: 'user',
    order: ['b', 'a'], parentVersionIds: ['missing'] }, 'now', 'staged');
  await publishParentOrderPosition(port, 'folder');
  expect(sqlite.prepare("SELECT * FROM parent_order_member_positions WHERE device_identity_key = 'local'").get()).toEqual(local);
  await adopt(position({ adopted_version_id: 'od', proof_revision: 5 }));
  expect(await adopt(position())).toBe(false);
  await expect(adopt(position({ adopted_version_id: 'ob', proof_revision: 5 })))
    .rejects.toThrow('node_position_revision_collision');
});

it('restores only the original verified body and never erases a locally held copy on relay', async () => {
  await chain();
  await adopt(position({ adopted_version_id: 'od' }));
  await collectParentOrderBodies(port, 'folder');
  const payload = parentOrderFactPayload('folder', { versionId: 'oc', kind: 'membership',
    order: ['a', 'b'], parentVersionIds: ['ob'] }, 'now');
  const original = { object_type: 'order_version', object_id: 'oc', deleted_at: null,
    content_hash: hashText(JSON.stringify(payload)), payload_json: JSON.stringify(payload), updated_at: 'now' };
  await applyParentOrderFactObject(port, original);
  expect(body('oc')).toBe('["a","b"]');
  await applyParentOrderFactObject(port, { ...original,
    payload_json: JSON.stringify({ ...payload, child_ids_json: 'null' }) });
  expect(body('oc')).toBe('["a","b"]');
  await collectParentOrderBodies(port, 'folder');
  await expect(port.transaction((tx) => applyParentOrderFactObject(tx, { ...original,
    payload_json: JSON.stringify({ ...payload, child_ids_json: '["b","a"]' }) })))
    .rejects.toThrow('sync_parent_order_fact_hash_mismatch');
  expect(body('oc')).toBe('null');
});
