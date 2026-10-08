import { expect, it } from 'vitest';

import { port, setupVersionCollectionFixture, sqlite } from '../../../electron/database/nodeVersionPayloadCollector.testSupport.js';

import { readFramedSyncInventory } from './framedSyncInventoryRead.js';
import { replayRetiredParentOrderBodies } from './parentOrderBodyReplay.js';
import { publishParentOrderPosition } from './parentOrderMemberPosition.js';
import { hashText } from './syncNodeResolution.js';
import { parentOrderFactPayload } from './syncParentOrderFact.js';
import { applyParentOrderFactObject } from './syncParentOrderFactApply.js';
import type { ParentOrderVersion } from './syncParentOrderVersionGraph.js';
import { advanceParentOrderHead, insertParentOrderVersion } from './syncParentOrderVersionStore.js';

setupVersionCollectionFixture();

function localDeclaration() {
  return sqlite.prepare(`SELECT position.*, state.content_hash FROM parent_order_member_positions position
    JOIN sync_object_state state ON state.object_type='parent_order_position' AND state.object_id=position.fact_id
    WHERE position.object_id='folder' AND position.device_identity_key='local'`).get();
}

function body() {
  return sqlite.prepare("SELECT child_ids_json FROM parent_order_versions WHERE version_id='right'").pluck().get();
}

function originalRecord() {
  const payload = parentOrderFactPayload('folder', { versionId: 'right', kind: 'membership',
    order: ['a', 'c'], parentVersionIds: ['base'] }, 'now');
  return { object_type: 'order_version' as const, object_id: 'right', content_hash: hashText(JSON.stringify(payload)),
    payload_json: JSON.stringify(payload), deleted_at: null, updated_at: 'now' };
}

async function incompleteMerge() {
  const base: ParentOrderVersion = { versionId: 'base', kind: 'baseline', order: ['a'], parentVersionIds: [] };
  await insertParentOrderVersion(port, 'folder', base, 'now');
  await advanceParentOrderHead(port, 'folder', 'base');
  await publishParentOrderPosition(port, 'folder');
  const old = localDeclaration();
  const versions: ParentOrderVersion[] = [
    { versionId: 'left', kind: 'membership', order: ['a', 'b'], parentVersionIds: ['base'] },
    { versionId: 'right', kind: 'membership', order: ['a', 'c'], parentVersionIds: ['base'] },
    { versionId: 'merged', kind: 'merge', order: ['a', 'b', 'c'], parentVersionIds: ['left', 'right'] }
  ];
  for (const version of versions) await insertParentOrderVersion(port, 'folder', version, 'now');
  await advanceParentOrderHead(port, 'folder', 'merged');
  sqlite.exec("UPDATE parent_order_versions SET child_ids_json='null' WHERE version_id='right'");
  await publishParentOrderPosition(port, 'folder');
  expect(localDeclaration()).toEqual(old);
  expect(body()).toBe('null');
  return old;
}

it.each(['apply', 'receipt replay'])('publishes adoption immediately after the last required body arrives through %s', async path => {
  const old = await incompleteMerge();
  await port.transaction(async tx => {
    if (path === 'apply') await applyParentOrderFactObject(tx, originalRecord());
    else await replayRetiredParentOrderBodies(tx, [originalRecord()]);
  });
  // Observe the applied transaction directly before invoking the inventory publisher.
  const current = localDeclaration();
  expect(body()).toBe('["a","c"]');
  expect(current).toMatchObject({ adopted_version_id: 'merged', pending_version_ids_json: '[]' });
  expect(current).not.toEqual(old);
  const proof = sqlite.prepare('SELECT * FROM node_version_local_proof_state').get();
  await readFramedSyncInventory(port);
  await readFramedSyncInventory(port);
  await port.transaction(tx => applyParentOrderFactObject(tx, originalRecord()));
  await port.transaction(tx => replayRetiredParentOrderBodies(tx, [originalRecord()]));
  expect(localDeclaration()).toEqual(current);
  expect(sqlite.prepare('SELECT * FROM node_version_local_proof_state').get()).toEqual(proof);
});

it('rolls back the restored body and its published declaration when the transaction receives a tampered source', async () => {
  const old = await incompleteMerge();
  const proof = sqlite.prepare('SELECT * FROM node_version_local_proof_state').get();
  await expect(port.transaction(async tx => {
    await applyParentOrderFactObject(tx, originalRecord());
    await applyParentOrderFactObject(tx, { ...originalRecord(), content_hash: 'tampered' });
  })).rejects.toThrow('sync_parent_order_fact_hash_mismatch');
  expect(body()).toBe('null');
  expect(localDeclaration()).toEqual(old);
  expect(sqlite.prepare('SELECT * FROM node_version_local_proof_state').get()).toEqual(proof);
});
