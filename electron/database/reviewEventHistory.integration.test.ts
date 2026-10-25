// @vitest-environment node
import { expect, it } from 'vitest';


import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState.js';
import { readReviewCalendarHistory } from '../../lib/core/database/reviewCalendarHistory.js';
import { EFFECTIVE_REVIEW_PREDICATE } from '../../lib/core/database/reviewLogRecord.js';
import { applyReviewGrade, resetNodeReviewState } from '../../lib/core/database/reviewMutations.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { identityReviewRowSchema } from '../../lib/core/sync/syncFactRowSchemas.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyReviewLogRecordsWithDbPort } from '../../lib/core/sync/syncReviewLogApply.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restoreFixture, transfer, type RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

const at = '2026-10-02T08:00:00.000Z';
const later = '2026-10-03T08:00:00.000Z';
const card = { due: later, last_review: at, state: 2 as const, stability: 1, difficulty: 2,
  elapsed_days: 0, scheduled_days: 1, reps: 1, lapses: 0 };
const profile = { due: later, lastReviewAt: at, state: 2, stability: 1, difficulty: 2,
  elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0 };
const rows = (p: RestorePeer) => p.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all();
const effective = (p: RestorePeer) => p.sqlite.prepare(`SELECT r.op_id FROM review_log r
  WHERE ${EFFECTIVE_REVIEW_PREDICATE} ORDER BY r.op_id`).pluck().all();

async function seed(peer: RestorePeer) {
  const node = textBranch('original', 'Question', undefined, at);
  await applySyncNodesWithDbPort(peer.db, [{ ...node, snapshot: { ...node.snapshot, kind: 'item' } }]);
}
function grade(peer: RestorePeer, opId = 'grade') {
  let n = 0;
  applyReviewGrade(createBetterSqlite3Driver(peer.sqlite), {
    nodeId: 'topic', opId, grade: 3, reviewedAt: at, schedulerVersion: 'test', cardBefore: card, cardAfter: card
  }, { hostName: peer.id, createId: () => `${opId}-${n++}` });
}
function replay(peer: RestorePeer, mode: 'undo' | 'redo', targetOpId: string, stamp = later) {
  saveNodeReviewStateWithSync(createBetterSqlite3Driver(peer.sqlite), { nodeId: 'topic',
    review: mode === 'undo' ? null : profile, hostName: peer.id, updatedAt: stamp,
    history: { mode, targetOpId } });
}
async function send(source: RestorePeer, target: RestorePeer) {
  const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] })
    .find(value => value.globalId === 'topic' && value.objectType === 'node');
  if (!difference) throw new Error('missing_test_inventory');
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference);
}

it('records grade, exact-target undo, redo and reset without deleting history or counting control events', async () => {
  const f = await restoreFixture(); const p = f.peer('local');
  try {
    await seed(p); grade(p);
    const driver = createBetterSqlite3Driver(p.sqlite);
    expect(effective(p)).toEqual(['grade']);
    replay(p, 'undo', 'grade');
    replay(p, 'undo', 'grade');
    expect(effective(p)).toEqual([]);
    expect(p.sqlite.prepare('SELECT * FROM node_review').all()).toEqual([]);
    expect(readReviewCalendarHistory(driver, { from: at, to: later }, 0).days).toEqual([]);
    replay(p, 'redo', 'grade');
    const redone = identityReviewRowSchema.parse(p.sqlite.prepare("SELECT * FROM review_log WHERE kind='review' AND op_id != 'grade'").get()).op_id;
    expect(effective(p)).toEqual([redone]);
    expect(readReviewCalendarHistory(driver, { from: at, to: later }, 0).days[0]?.items).toBe(1);
    replay(p, 'undo', redone, '2026-10-04T08:00:00.000Z');
    grade(p, 'replacement');
    resetNodeReviewState(driver, 'topic', { hostName: p.id, deletedAt: '2026-10-05T08:00:00.000Z' });
    expect(effective(p)).toEqual(['replacement']);
    expect(rows(p)).toHaveLength(6);
    expect(p.sqlite.prepare('SELECT kind, voids_op_id FROM review_log WHERE kind = ? ORDER BY reviewed_at').all('void'))
      .toEqual([{ kind: 'void', voids_op_id: 'grade' }, { kind: 'void', voids_op_id: redone }]);
    expect(p.sqlite.prepare('SELECT * FROM node_review').all()).toEqual([]);
    expect(p.sqlite.prepare<[], { name: string }>('PRAGMA table_info(review_log)').all().map(row => row.name))
      .toEqual(['id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version', 'reviewed_at', 'kind', 'voids_op_id']);
  } finally { await f.close(); }
});

it('keeps state and facts atomic if reset or undo event storage fails', async () => {
  const f = await restoreFixture(); const p = f.peer('local');
  try {
    await seed(p); grade(p);
    const before = p.sqlite.prepare('SELECT * FROM node_review').all();
    p.sqlite.exec("CREATE TRIGGER reject_control BEFORE INSERT ON review_log WHEN NEW.kind != 'review' BEGIN SELECT RAISE(ABORT, 'full'); END");
    expect(() => replay(p, 'undo', 'grade')).toThrow('full');
    expect(() => resetNodeReviewState(createBetterSqlite3Driver(p.sqlite), 'topic',
      { hostName: 'local', deletedAt: later })).toThrow('full');
    expect(p.sqlite.prepare('SELECT * FROM node_review').all()).toEqual(before);
    expect(rows(p)).toHaveLength(1);
  } finally { await f.close(); }
});

it('converges facts through production request sync when void precedes its target, with replay and reopen', async () => {
  const f = await restoreFixture(); const a = f.peer('source'); const b = f.peer('target');
  try {
    await seed(a); await seed(b); grade(a);
    replay(a, 'undo', 'grade');
    const [voidEvent] = a.sqlite.prepare("SELECT * FROM review_log WHERE kind = 'void'").all();
    await applyReviewLogRecordsWithDbPort(b.db, [identityReviewRowSchema.parse(voidEvent)]);
    expect(effective(b)).toEqual([]);
    await send(a, b); b.reopen();
    await send(a, b); await send(b, a);
    expect(rows(a)).toEqual(rows(b)); expect(effective(b)).toEqual([]);
    replay(a, 'redo', 'grade');
    resetNodeReviewState(createBetterSqlite3Driver(a.sqlite), 'topic', { hostName: a.id, deletedAt: later });
    await send(a, b); await send(b, a); a.reopen(); b.reopen();
    expect(rows(a)).toEqual(rows(b)); expect(effective(a)).toHaveLength(1);
    expect(effective(b)).toEqual(effective(a));
  } finally { await f.close(); }
});
