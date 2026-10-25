// @vitest-environment node
import { expect, it } from 'vitest';

import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { projectFramedSyncReview } from '../../lib/core/sync/framedSyncRelationReviewFact.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { context, originals, restoreFixture, transfer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

it('preserves the exact one-MiB version and two review-only operations across repeat and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const body = '中😀'.repeat(149_796) + 'abcd';
    expect(Buffer.byteLength(body)).toBe(1_048_576);
    const record = textBranch('original-version', body);
    await applySyncNodesWithDbPort(source.db, [record]);
    const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
      providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
    const differences = () => readRequestSyncInventorySnapshot(source.db).then(local => compareFramedSyncInventories({ local, remote: [] }));
    const initial = (await differences()).find(value => value.objectType === 'node' && value.globalId === 'topic')!;
    await transfer(source, target, progress, initial);
    const reviewedAt = '2026-10-05T02:00:00.000Z';
    const facts = ['review-only-1', 'review-only-2'].map(op => projectFramedSyncReview({

      grade: 3, host_name: 'source', id: `row-${op}`, node_id: 'topic', op_id: op,
      reviewed_at: reviewedAt, kind: 'review', voids_op_id: null, scheduler_version: 'fsrs-6',   }));
    await applyFramedFactSources(source.db, [async function* () { yield* facts; }], {
      loadBody: async () => { throw new Error('review_body_not_expected'); } });
    const difference = { ...(await differences()).find(value => value.globalId === 'topic')!,
      need: { sharedState: false, frontierFactIds: [], requiredRelationIds: [], resourceHashes: [],
        stateFactIds: [], reviewFactIds: ['review-only-1', 'review-only-2'] } };
    await withRequestSyncFiles(source.host.files, async request => {
      await writeRequestSyncSnapshot(source.db, difference, request);
      const saved = [];
      for await (const fact of request.readFacts()) { expect(fact.blobs).toEqual([]); saved.push(fact); }
      expect(saved).toHaveLength(2);
    });
    await transfer(source, target, progress, difference);
    await transfer(source, target, progress, difference);
    target.reopen();
    expect(target.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all())
      .toEqual(source.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all());
    expect(target.sqlite.prepare("SELECT content, current_version_id FROM nodes WHERE id = 'topic'").get())
      .toEqual({ content: body, current_version_id: record.version_id });
    expect(target.sqlite.prepare('SELECT version_id, content_hash, body_text FROM node_sync_versions').all())
      .toEqual([{ version_id: record.version_id, content_hash: record.content_hash, body_text: body }]);
  } finally { await fixture.close(); }
});

it.each(['unsupported', 'different-object', 'wrong-body', 'missing-parent'] as const)(
  'rejects %s facts without changing any receiver node facts', async fault => {
    const fixture = await restoreFixture();
    const source = fixture.peer('source'); const target = fixture.peer('target');
    try {
      const record = textBranch('version', 'Original');
      if (fault === 'missing-parent') record.snapshot.parent_id = 'missing-parent';
      const projection = projectFramedSyncNodeRecord(record);
      let facts: CanonicalFact[] = [...projection.manifest.facts];
      if (fault === 'unsupported') facts = [{ ...facts[0]!, kind: 5 }];
      if (fault === 'different-object') facts.push({ ...facts[0]!, globalId: 'other' });
      const progress = { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
        providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch };
      const before = originals(target);
      await expect(applyRequestSyncObject(target.db, { context: context(progress),
        peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: source.id,
          library_epoch: source.epoch, proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
        globalId: 'topic', objectType: 'node', requestId: new Uint8Array(16),
        facts: async function* () { yield* facts; }, loadBody: async () => fault === 'wrong-body'
          ? new TextEncoder().encode('Altered!') : projection.bodyBlob })).rejects.toThrow();
      expect(originals(target)).toEqual(before);
    } finally { await fixture.close(); }
  });
