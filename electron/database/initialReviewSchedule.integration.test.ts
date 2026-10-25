// @vitest-environment node
import { rmSync } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { loadCompanionWorkspaceNodeFromDb } from '../../lib/core/database/companionWorkspaceNodeRead.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion.js';
import { createInitialNewItemReviewProfile } from '../../lib/core/review/newItemReviewSlots.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { restoreFixture, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { firstAt, history, reset, reviewFacts, reviewState, score, sendReviews } from './reviewProjection.testSupport.js';

const due = '2026-10-10T08:00:00.000Z';
const input = { nodeId: 'topic', parentNodeId: null, kind: 'item', title: 'Question', content: 'Question',
  reveal: 'Answer', isTitleManual: true, anchorLink: null, position: null, createdAt: firstAt, updatedAt: firstAt,
  review: createInitialNewItemReviewProfile(due) } satisfies Parameters<typeof upsertNodeSnapshot>[1];

async function prepareTarget(peer: RestorePeer, host: string) {
  if (host === 'desktop') return;
  peer.sqlite.close();
  rmSync(peer.file);
  peer.sqlite = new Database(peer.file);
  await bootstrapCompanionDatabase(peer.db, { allowCreate: true, expectedHostName: host, now: firstAt });
  peer.sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'secret', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', '${peer.id}', 'active', 'now');`);
  for (const member of ['source', 'target', 'observer']) peer.sqlite.prepare(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, ?, ?, ?, ?, 'active', 'now', 'now')`).run(member, member, `/${member}`, member, host);
}

it.each(['desktop', 'android', 'ios'])('preserves first scheduling on %s across reopen, framed sync, edits and undo', async host => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  try {
    await prepareTarget(target, host);
    source.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('host_name', JSON.stringify(source.id), firstAt);
    bindParentOrderWriter(createBetterSqlite3Driver(source.sqlite), { deviceAnchor: source.id, libraryPath: source.file });
    upsertNodeSnapshot(createBetterSqlite3Driver(source.sqlite), input);
    source.reopen();
    expect(reviewState(source)).toEqual([expect.objectContaining({ node_id: 'topic', due, reps: 0 })]);
    flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(source.sqlite), 'topic', source.id, firstAt);
    await sendReviews(source, target, host === 'desktop');
    target.reopen();
    expect(reviewState(target)).toEqual(reviewState(source));
    expect(reviewFacts(source)).toEqual([]);
    expect(reviewFacts(target)).toEqual([]);
    upsertNodeSnapshot(createBetterSqlite3Driver(source.sqlite), { ...input, title: 'Edited',
      updatedAt: '2026-10-02T08:00:00.000Z', review: createInitialNewItemReviewProfile('2099-01-01T00:00:00.000Z') });
    flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(source.sqlite), 'topic', source.id, '2026-10-02T08:00:00.000Z');
    await sendReviews(source, target, host === 'desktop');
    expect(reviewState(target)).toEqual([expect.objectContaining({ due, reps: 0 })]);
    score(source, 'first', '2026-10-11T08:00:00.000Z');
    await sendReviews(source, target, host === 'desktop');
    expect(reviewState(target)).toEqual(reviewState(source));
    expect(reviewState(target)).toEqual([expect.objectContaining({ reps: 1 })]);
    const graded = reviewState(source);
    upsertNodeSnapshot(createBetterSqlite3Driver(source.sqlite), { ...input, title: 'Edited after grading',
      updatedAt: '2026-10-11T09:00:00.000Z' });
    flushNodeSyncVersionWithDriver(createBetterSqlite3Driver(source.sqlite), 'topic', source.id, '2026-10-11T09:00:00.000Z');
    await sendReviews(source, target, host === 'desktop');
    expect(reviewState(target)).toEqual(graded);
    history(source, 'undo', 'first', '2026-10-12T08:00:00.000Z');
    await sendReviews(source, target, host === 'desktop');
    expect(reviewState(target)).toEqual([expect.objectContaining({ due, reps: 0 })]);
    reset(source, '2026-10-13T08:00:00.000Z');
    await sendReviews(source, target, host === 'desktop');
    target.reopen();
    expect(reviewState(target)).toEqual([]);
    expect(reviewFacts(target)).toEqual(reviewFacts(source));
    expect(target.sqlite.prepare("SELECT * FROM sync_object_state WHERE object_type='node_review'").all()).toEqual([]);
  } finally { await fixture.close(); }
});

it.each(['android', 'ios'])('sends the original first schedule from a newly created %s card without a review event', async host => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  try {
    await prepareTarget(source, host);
    const node = { id: 'topic', parentNodeId: null, kind: 'item' as const, title: 'Question', content: 'Question',
      isTitleManual: true, hideTitleHeading: false, reveal: 'Answer', anchorLink: null, reading: null,
      review: input.review, createdAt: firstAt, updatedAt: firstAt };
    const version = await toWorkspaceNativeNodeVersion(node, source.id);
    await applySyncNodesWithDbPort(source.db, [version], { enqueueSearchInvalidations: false });
    source.reopen();
    expect((await loadCompanionWorkspaceNodeFromDb(source.db, 'topic'))?.initialReviewDue).toBe(due);
    await sendReviews(source, target);
    target.reopen();
    expect(reviewState(source)).toEqual([expect.objectContaining({ due, reps: 0 })]);
    expect(reviewState(target)).toEqual(reviewState(source));
    expect(reviewFacts(target)).toEqual([]);
    const wrong = await toWorkspaceNativeNodeVersion({ ...node, currentVersionId: version.version_id!,
      initialReviewDue: '2099-01-01T00:00:00.000Z', title: 'Invalid edit', updatedAt: '2026-10-02T08:00:00.000Z' }, source.id);
    await expect(applySyncNodesWithDbPort(target.db, [wrong])).rejects.toThrow('initial_review_schedule_conflict');
    target.reopen();
    expect(target.sqlite.prepare('SELECT title FROM nodes WHERE id = ?').pluck().get('topic')).toBe('Question');
    expect(reviewState(target)).toEqual(reviewState(source));
  } finally { await fixture.close(); }
});
