// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../../electron/database/betterSqlite3Driver.js';
import { applyDesktopFramedSyncRelationReviewFactsWithDbPort } from '../../../../electron/database/desktopFramedSyncRelationReviewApply.js';
import { textBranch } from '../../../../electron/database/topicTextState.testSupport.js';
import { saveNodeReadingStateWithSync } from '../../database/nodeReadingSyncState.js';
import { computeSyncContentHash } from '../../database/syncState.js';
import { hashTextBody } from '../../database/textBodyHash.js';
import { restoreFramedSyncNodeChildFact } from '../framedSyncNodeChildFact.js';
import { projectFramedSyncParentRelation, projectFramedSyncReview } from '../framedSyncRelationReviewFact.js';
import { applyConvergentSyncNodesWithDbPort } from '../syncNodeConvergence.js';
import { applySyncObjectInTransaction } from '../syncObjectApplyExecutor.js';

import { createFolderWriterFixture, inspectStoredObject } from './writeRound.testSupport.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture() {
  const f = await createFolderWriterFixture();
  cleanups.push(f.close);
  return f;
}

it('retains prior bodies while successive edits, a new node and a deletion reach the folder', async () => {
  const f = await fixture();
  await f.run();
  let previous = f.first;
  for (const id of ['v2', 'v3']) {
    const next = textBranch(id, `Body ${id}`, previous);
    await applyConvergentSyncNodesWithDbPort(f.db, [next]);
    expect(await f.run()).toMatchObject({ changedObjects: 1 });
    previous = next;
  }
  const added = textBranch('new-v1', 'New article');
  added.object_id = added.snapshot.id = 'new-topic';
  await applyConvergentSyncNodesWithDbPort(f.db, [added]);
  expect(await f.run()).toMatchObject({ changedObjects: 1 });
  const deleted = textBranch('deleted', '', previous, '2026-11-04T01:00:00.000Z');
  deleted.snapshot.deleted_at = deleted.updated_at;
  await applyConvergentSyncNodesWithDbPort(f.db, [deleted]);
  expect(await f.run()).toMatchObject({ changedObjects: 1 });
  const checkpoint = (await f.checkpoint())!;
  const stored = await Promise.all(checkpoint.objects.map(object => inspectStoredObject(f, object)));
  expect(stored.flatMap(object => object.bodies)).toEqual(expect.arrayContaining(['First article', 'Body v2', 'Body v3', 'New article']));
  expect(stored.flatMap(object => object.facts).map(fact => fact.factId)).toContain('deleted');
  expect(f.sqlite.prepare('SELECT deleted_at FROM nodes WHERE id = ?').pluck().get('topic')).toBe(deleted.updated_at);
  expect(await f.run()).toMatchObject({ changed: false });
});

it('writes reading, review and parent facts through the existing node export without resending known bodies', async () => {
  const f = await fixture();
  const v2 = textBranch('v2', 'Second', f.first);
  const v3 = textBranch('v3', 'Third', v2);
  await applyConvergentSyncNodesWithDbPort(f.db, [v2, v3]);
  await f.run();
  const relation = projectFramedSyncParentRelation({ object_id: 'topic', ordinal: 1,
    version_id: 'v3', parent_version_id: 'v1' });
  const review = projectFramedSyncReview({ id: 'review', op_id: 'review-op', node_id: 'topic', host_name: 'Source',
    grade: 3, kind: 'review', voids_op_id: null, scheduler_version: 'fsrs-6', reviewed_at: '2026-11-04T01:00:00.000Z' });
  await f.db.transaction(tx => applyDesktopFramedSyncRelationReviewFactsWithDbPort(tx, [relation, review]));
  saveNodeReadingStateWithSync(createBetterSqlite3Driver(f.sqlite), { nodeId: 'topic', hostName: 'Source',
    reading: { intervalDurationMs: 1000, intervalGrowthFactor: 2, lastHandledAt: '2026-11-04', nextAt: '2026-11-05',
      priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active' }, updatedAt: '2026-11-04T01:01:00.000Z' });
  expect(await f.run()).toMatchObject({ changedObjects: 1 });
  const stored = await inspectStoredObject(f, (await f.checkpoint())!.objects.at(-1)!);
  expect(stored.facts.map(fact => fact.factId)).toEqual(expect.arrayContaining([relation.factId, review.factId]));
  const reading = restoreFramedSyncNodeChildFact(stored.facts.find(fact => fact.kind === 1)!);
  expect(reading).toMatchObject({ object_type: 'node_reading', object_id: 'topic' });
  expect(JSON.parse(reading.payload_json!)).toMatchObject({ repetition_count: 1, next_at: '2026-11-05' });
  expect(stored.bodies).toEqual([]);
  expect(await f.run()).toMatchObject({ changed: false });
});

it('writes external document bodies through their original non-node producer', async () => {
  const f = await fixture();
  const body = 'External document original';
  const hash = hashTextBody(body);
  const payload = { body_blob_hash: hash, content_hash: hash, document_id: 'external-original', extension: 'md',
    file_name: 'original.md', folder_id: 'external-folder', reference_json: null,
    reference_kind: 'local_path', relative_path: 'original.md', title: 'Original' };
  await f.db.transaction(tx => applySyncObjectInTransaction(tx, { object_type: 'external_document', object_id: payload.document_id,
    content_hash: computeSyncContentHash('external_document', payload), deleted_at: null,
    payload_json: JSON.stringify({ ...payload, content: body }), updated_at: '2026-11-04T00:00:00.000Z' }));
  await f.run();
  const object = (await f.checkpoint())!.objects.find(value => value.objectType === 'external_document')!;
  const stored = await inspectStoredObject(f, object);
  expect(stored.bodies).toEqual([body]);
  expect(stored.facts[0]).toMatchObject({ objectType: 'external_document', globalId: payload.document_id });
  expect(await f.run()).toMatchObject({ changed: false });
});
