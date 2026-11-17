import { expect } from 'vitest';

import { resetNodeReviewState } from '../../lib/core/database/reviewMutations.js';
import { loadWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot.js';
import { collectReviewQueueCandidates } from '../../lib/core/review/queue/reviewQueuePlannerCandidates.js';
import { createReviewQueueTimeInput } from '../../lib/core/review/queue/reviewQueueTimeInput.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import type { RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { score, sendReviews } from './reviewProjection.testSupport.js';

export interface ImportedSourceEntry {
  id: number;
  nodeId: string | null;
  parentId?: number;
  sourceArticleId?: number | null;
}

export function dueCards(driver: ReturnType<typeof createBetterSqlite3Driver>, now: string) {
  const snapshot = loadWorkspaceSnapshot(driver)!;
  return collectReviewQueueCandidates({ ...snapshot, trashedNodeIds: new Set(snapshot.trashedNodeIds),
    includeScheduled: false, time: createReviewQueueTimeInput(0, 0), now }).fsrsCandidates.map(node => node.id);
}

export async function syncWithAncestors(source: RestorePeer, target: RestorePeer, nodeId: string, now = new Date().toISOString()) {
  const driver = createBetterSqlite3Driver(source.sqlite);
  const ancestors = source.sqlite.prepare(`WITH RECURSIVE parents(id, parent_id) AS (
    SELECT id, parent_id FROM nodes WHERE id = ?
    UNION ALL SELECT n.id, n.parent_id FROM nodes n JOIN parents p ON n.id = p.parent_id
  ) SELECT id FROM parents WHERE id != ?`).pluck().all(nodeId, nodeId) as string[];
  for (const id of ancestors.reverse()) {
    if (target.sqlite.prepare('SELECT 1 FROM nodes WHERE id = ?').get(id)) continue;
    flushNodeSyncVersionWithDriver(driver, id, source.id, now);
    await sendReviews(source, target, true, [], id);
  }
  flushNodeSyncVersionWithDriver(driver, nodeId, source.id, now);
  await sendReviews(source, target, true, [], nodeId);
}

export async function verifyDismissedSync(source: RestorePeer, target: RestorePeer, nodeId: string, now: string) {
  const driver = createBetterSqlite3Driver(source.sqlite);
  const later = new Date(Date.parse(now) + 60_000).toISOString();
  await syncWithAncestors(source, target, nodeId, now);
  target.sqlite.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('host_name', JSON.stringify(target.id), now);
  target.reopen();
  const targetDriver = createBetterSqlite3Driver(target.sqlite);
  expect(loadWorkspaceSnapshot(targetDriver)?.nodesById[nodeId]?.reading?.state).toBe('dismissed');
  expect(dueCards(targetDriver, later)).not.toContain(nodeId);
  resetNodeReviewState(driver, nodeId, { hostName: source.id, deletedAt: later });
  expect(dueCards(driver, later)).toContain(nodeId);
  await sendReviews(source, target, true, [], nodeId);
  expect(dueCards(targetDriver, later)).toContain(nodeId);
}

export async function verifyFirstScores(source: RestorePeer, target: RestorePeer, now: string, adjust: () => Promise<unknown>) {
  const eligible = new Set(dueCards(createBetterSqlite3Driver(source.sqlite), now));
  const readSchedules = () => {
    const rows = source.sqlite.prepare('SELECT node_id, due FROM node_review').all() as { node_id: string; due: string }[];
    return new Map(rows.map(row => [row.node_id, row.due]));
  };
  const selected = [...readSchedules().keys()].filter(id => eligible.has(id)).slice(0, 10);
  expect(selected).toHaveLength(10);
  const before = readSchedules();
  for (const [index, id] of selected.entries()) score(source, `learning-first-${index}`, now, 3, id);
  source.reopen();
  const graded = readSchedules();
  for (const id of selected) expect(graded.get(id)).not.toBe(before.get(id));
  expect(await adjust())
    .toMatchObject({ protectedItems: 10 });
  const adjusted = readSchedules();
  for (const id of selected) expect(adjusted.get(id)).toBe(graded.get(id));
  expect([...adjusted].some(([id, due]) => !selected.includes(id) && due !== graded.get(id))).toBe(true);

  const first = selected[0]!;
  await syncWithAncestors(source, target, first, now);
  target.reopen();
  const storedReview = (peer: RestorePeer) =>
    loadWorkspaceSnapshot(createBetterSqlite3Driver(peer.sqlite))!.nodesById[first]?.review;
  expect(storedReview(source)).toMatchObject({ due: graded.get(first), lastReviewAt: now });
  expect(storedReview(target)).toEqual(storedReview(source));
}

export async function verifyImportedHierarchyOnPeer(source: RestorePeer, target: RestorePeer, entries: ImportedSourceEntry[], now: string) {
  const nodeId = (id: number) => entries.find(entry => entry.id === id)!.nodeId!;
  for (const id of [3517, 797, 1348]) await syncWithAncestors(source, target, nodeId(id), now);
  target.reopen();
  const nodes = loadWorkspaceSnapshot(createBetterSqlite3Driver(target.sqlite))!.nodesById;
  expect(nodes[nodeId(3517)]).toMatchObject({ parentNodeId: nodeId(825),
    anchorLink: { kind: 'highlight', locator: { originalText: expect.stringContaining('知道别人在看着你') } } });
  expect(nodes[nodeId(1148)]?.parentNodeId).toBe(nodeId(3302));
  expect(nodes[nodeId(797)]).toMatchObject({ parentNodeId: nodeId(1148), anchorLink: { kind: 'cloze' } });
  expect(nodes[nodeId(1348)]).toMatchObject({ parentNodeId: nodeId(1085),
    anchorLink: { kind: 'cloze', locator: { originalText: '思考' } } });
}
