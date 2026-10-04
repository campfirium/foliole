import { expect, it } from 'vitest';

import { syncIdentityFingerprint } from './syncIdentityDigest.js';
import { buildSyncIdentityPackPage } from './syncIdentityPackPage.js';
import { createSyncIdentityStructuralParentReader, readSyncIdentityOriginalSourceHead,
  type SyncIdentitySourceDescriptorReader } from './syncIdentityStructuralParent.js';

const digest = 'a'.repeat(64);
function fact(nodeId: string, parentId: string | null, versionId = `${nodeId}-head`) {
  return { version_id: versionId, object_id: nodeId, content_hash: `${nodeId}-content-hash`,
    body_hash: 'b'.repeat(64), snapshot_metadata: JSON.stringify({ id: nodeId, parent_id: parentId, deleted_at: null }) };
}

function reader(parents: Record<string, string | null>): SyncIdentitySourceDescriptorReader {
  return async ({ nodeId, section }) => ({ node_id: nodeId, section, fact_digest: digest,
    head_id: `${nodeId}-head`, entries: section === 'versions' ? [fact(nodeId, parents[nodeId] ?? null)] : [], nextAfter: null });
}

function basePage() {
  return buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: 'source', target_peer_id: 'target',
    source_view_id: '11111111-1111-4111-8111-111111111111', page_index: 3,
    previous_page_id: 'd'.repeat(64), restore_id: 'restore', restore_set_id: 'e'.repeat(64),
    objects: [{ object_type: 'node', object_id: 'child', fingerprint: 'c'.repeat(64) }] });
}

it('reads original current metadata across pages and builds source-bound structural parent identities', async () => {
  const read = reader({ child: 'parent', parent: null });
  const calls: Array<{ section: string; after: string | null }> = [];
  const paged: SyncIdentitySourceDescriptorReader = async (request) => {
    calls.push(request);
    if (request.nodeId !== 'child' || request.section !== 'versions') return read(request);
    return { node_id: 'child', section: 'versions', fact_digest: digest, head_id: 'child-head',
      entries: request.after === null ? [fact('child', null, 'child-a')] : [fact('child', 'parent')],
      nextAfter: request.after === null ? 'child-a' : null };
  };
  const head = await readSyncIdentityOriginalSourceHead(paged, 'child');
  expect(calls.map((call) => [call.section, call.after])).toEqual([
    ['requirements', null], ['versions', null], ['versions', 'child-a']]);
  const readParent = createSyncIdentityStructuralParentReader(paged, head);
  const parent = await readParent(basePage());
  expect(parent).toMatchObject({ group_id: 'group', source_peer_id: 'source', target_peer_id: 'target',
    source_view_id: basePage().source_view_id, restore_id: 'restore', restore_set_id: 'e'.repeat(64),
    facts: { section: 'head', digest }, objects: [{ object_type: 'node', object_id: 'parent',
      fingerprint: syncIdentityFingerprint({ object_type: 'node', object_id: 'parent',
        content_hash: 'parent-content-hash', current_version_id: 'parent-head', deleted_at: null }) }] });
  if (!parent) throw new Error('fixture_parent_missing');
  expect(await readParent(parent)).toBeNull();
});

it('rejects a structural cycle before transferring another copy of the child', async () => {
  const read = reader({ child: 'parent', parent: 'child' });
  const readParent = createSyncIdentityStructuralParentReader(read, await readSyncIdentityOriginalSourceHead(read, 'child'));
  const parent = await readParent(basePage());
  if (!parent) throw new Error('fixture_parent_missing');
  await expect(readParent(parent)).rejects.toThrow('sync_pack_node_parent_cycle');
});

it('rejects a missing original current head instead of using another historical snapshot', async () => {
  const read: SyncIdentitySourceDescriptorReader = async ({ nodeId, section }) => ({ node_id: nodeId,
    section, fact_digest: digest, head_id: 'missing-head', entries: section === 'versions' ? [fact(nodeId, null)] : [], nextAfter: null });
  await expect(readSyncIdentityOriginalSourceHead(read, 'child')).rejects.toThrow('sync_identity_original_head_missing');
});

it('rejects invalid original snapshot metadata and unavailable original body', async () => {
  const read: SyncIdentitySourceDescriptorReader = async ({ nodeId, section }) => ({ node_id: nodeId,
    section, fact_digest: digest, head_id: 'child-head', entries: section === 'versions' ?
      [{ ...fact(nodeId, null), snapshot_metadata: 'not-json' }] : [], nextAfter: null });
  await expect(readSyncIdentityOriginalSourceHead(read, 'child')).rejects.toThrow('sync_identity_source_head_snapshot_invalid');
  const missingBody: SyncIdentitySourceDescriptorReader = async ({ nodeId, section }) => ({ node_id: nodeId,
    section, fact_digest: digest, head_id: 'child-head', entries: section === 'versions' ?
      [{ ...fact(nodeId, null), body_hash: null }] : [], nextAfter: null });
  await expect(readSyncIdentityOriginalSourceHead(missingBody, 'child')).rejects.toThrow('sync_pack_fact_body_unavailable');
});

it('rejects a descriptor page from a changed fixed view', async () => {
  const read: SyncIdentitySourceDescriptorReader = async ({ nodeId, section }) => ({ node_id: nodeId,
    section, fact_digest: section === 'versions' ? 'f'.repeat(64) : digest, head_id: 'child-head',
    entries: section === 'versions' ? [fact(nodeId, null)] : [], nextAfter: null });
  await expect(readSyncIdentityOriginalSourceHead(read, 'child')).rejects.toThrow('sync_identity_source_view_changed');
});
