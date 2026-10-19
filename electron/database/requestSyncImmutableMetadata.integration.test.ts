// @vitest-environment node
import { expect, it } from 'vitest';

import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { withRequestSyncFiles, type RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { context, restoreFixture, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

async function snapshot(source: RestorePeer, consume: (request: RequestSyncFiles, facts: CanonicalFact[]) => Promise<void>) {
  const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] })
    .find(value => value.objectType === 'node' && value.globalId === 'topic');
  if (!difference) throw new Error('immutable_fixture_difference_missing');
  await withRequestSyncFiles(source.host.files, async request => {
    await writeRequestSyncSnapshot(source.db, difference, request);
    const facts: CanonicalFact[] = [];
    for await (const fact of request.readFacts()) facts.push(fact);
    await consume(request, facts);
  });
}

function apply(source: RestorePeer, target: RestorePeer, request: RequestSyncFiles, facts: readonly CanonicalFact[], currentVersionId?: string) {
  return applyRequestSyncObject(target.db, {
    context: context({ groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }),
    peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
      library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
    objectType: 'node', globalId: 'topic', requestId: new Uint8Array(16), enqueueSearchInvalidations: false,
    ...(currentVersionId ? { currentVersionId } : {}),
    facts: async function* () { yield* facts; }, loadBody: (_db, blob) => request.loadBody(blob)
  });
}

function durableState(peer: RestorePeer) {
  return ['nodes', 'node_sync_versions', 'node_sync_version_parents', 'sync_object_state', 'sync_state_sequence',
    'node_version_device_revisions', 'node_version_local_proof_state',
    'content_blobs', 'content_blob_data'].map(table => peer.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

function changeTitle(fact: CanonicalFact): CanonicalFact {
  if (fact.kind !== 2 || fact.factId !== 'original') return fact;
  return { ...fact, body: fact.body.map(field => {
    if (field.name !== 'snapshot' || field.value.kind !== 'object') return field;
    return { ...field, value: { kind: 'object', value: field.value.value.map(value => value.name === 'title'
      ? { ...value, value: { kind: 'string', value: 'Contradictory title' } } : value) } };
  }) };
}

it.each([undefined, 'original'])('rejects changed original metadata without receiver writes with declared head %s', async currentVersionId => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await applySyncNodesWithDbPort(source.db, [textBranch('original', '\uFEFFOriginal中😀\0\r\n')]);
    await snapshot(source, async (request, facts) => {
      await apply(source, target, request, facts, currentVersionId); target.reopen();
      const before = durableState(target);
      const changed = facts.map(changeTitle);
      expect(changed).not.toEqual(facts);
      await expect(apply(source, target, request, changed, currentVersionId))
        .rejects.toThrow(/^sync_pack_node_version_immutable_mismatch:original$/u);
      target.reopen();
      expect(durableState(target)).toEqual(before);
      await apply(source, target, request, facts, currentVersionId); target.reopen();
      expect(target.sqlite.prepare("SELECT title, content, current_version_id FROM nodes WHERE id = 'topic'").get())
        .toEqual({ title: 'Topic', content: '\uFEFFOriginal中😀\0\r\n', current_version_id: 'original' });
      expect(target.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get()).toBe(1);
    });
  } finally { await fixture.close(); }
});

it('accepts canonical optional fields and retired identity replay without losing original metadata', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const original = textBranch('original', 'Original body');
    await applySyncNodesWithDbPort(source.db, [original]);
    await applySyncNodesWithDbPort(target.db, [original]);
    // The direct fixture omits optional fields that the wire snapshot represents as null.
    expect(original.snapshot).not.toHaveProperty('image_sources');
    await snapshot(source, async (request, facts) => { await apply(source, target, request, facts); });
    const retained = target.sqlite.prepare<[], Record<string, unknown> & { snapshot_json: string }>(
      "SELECT * FROM node_sync_versions WHERE version_id = 'original'").get()!;
    const retired = { ...retained, body_text: null,
      snapshot_json: JSON.stringify({ ...JSON.parse(retained.snapshot_json), content: null, body_deleted: true }) };
    await applySyncNodesWithDbPort(source.db, [textBranch('head', 'Current body', original)]);
    expect(await collectNodeVersionPayloads(source.db, 'topic')).toEqual({ released: 1, skipped: null });
    await snapshot(source, async (request, facts) => {
      const identity = facts.find(fact => fact.kind === 2 && fact.factId === 'original');
      expect(identity).toBeDefined(); expect(identity!.blobs).toEqual([]);
      for (let replay = 0; replay < 2; replay++) {
        await apply(source, target, request, facts); target.reopen();
        expect(target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE version_id = 'original'").get()).toEqual(retired);
        expect(target.sqlite.prepare('SELECT version_id, parent_version_id FROM node_sync_version_parents').all())
          .toEqual([{ version_id: 'head', parent_version_id: 'original' }]);
        expect(target.sqlite.prepare("SELECT content, current_version_id FROM nodes WHERE id = 'topic'").get())
          .toEqual({ content: 'Current body', current_version_id: 'head' });
      }
    });
  } finally { await fixture.close(); }
});
