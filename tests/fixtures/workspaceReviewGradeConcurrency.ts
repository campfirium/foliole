import { vi } from 'vitest';

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection.js';
import { openDesktopDailyFlow, commitDesktopDailyFlow } from '../../electron/database/dailyFlow.js';
import { loadOrCreateDesktopHostName } from '../../electron/database/hostProfile.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations.js';
import { applyReviewGrade } from '../../electron/database/reviewMutations.js';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot.js';
import { reviewGrade, reviewPreview } from '../../electron/ipc/review.js';
import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState.js';
import { dailyFlowCommitSchema } from '../../lib/core/flow/dailyFlowContract';
import { mapGradeToRustRating } from '../../lib/core/review/types.js';
import type { Node } from '../../src/features/nodes/model/nodeTypes';
import type { ReviewSchedulerAdapter } from '../../src/features/review/model/reviewTypes';
import { toSchedulerCard } from '../../src/features/review/model/reviewTypes';
import { createWorkspaceActionHistoryActions } from '../../src/store/workspaceActionHistory';
import { installWorkspaceHistoryPersistence } from '../../src/store/workspaceHistoryPersistence';
import type { WorkspaceReviewPersistenceAdapter } from '../../src/store/workspaceReviewPersistence';
import { createWorkspaceReviewActions } from '../../src/store/workspaceStoreReviewActions';
import { createQaNode, createSetStateHarness, createWorkspaceFixture } from '../../src/store/workspaceStoreReviewActions.test-support';

export const connection = () => openDatabaseConnection();
export const now = '2026-10-26T08:00:00.000Z';

export function saveNode(node: Node) {
  upsertNodeSnapshot({ nodeId: node.id, parentNodeId: node.parentNodeId, kind: node.kind,
    title: node.title, isTitleManual: true, content: node.content, reveal: node.reveal ?? null,
    anchorLink: null, position: 0, review: node.review ?? null,
    createdAt: node.createdAt, updatedAt: node.updatedAt });
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

export async function prepare() {
  const nodes = [createQaNode('first', now), createQaNode('other', now)];
  nodes.forEach(saveNode);
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const computing = deferred();
  const computed = deferred();
  const saving = deferred();
  const saved = deferred();
  const scheduler: ReviewSchedulerAdapter = { preview: async input => reviewPreview({ request: input }), grade: async input => {
    computing.resolve();
    await computed.promise;
    return reviewGrade({ request: { ...input, rating: mapGradeToRustRating(input.grade) } });
  } };
  const persistReviewGrade = vi.fn<WorkspaceReviewPersistenceAdapter['persistReviewGrade']>(async () => false);
  currentCommit = async payload => {
    const args = dailyFlowCommitSchema.parse(payload);
    if (args.grade) await persistReviewGrade({ ...args.grade, currentNodeId: args.grade.nodeId, opId: args.opId });
    const result = await commitDesktopDailyFlow(args);
    if (args.grade) { saving.resolve(); await saved.promise; }
    return result;
  };
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, scheduler);
  await actions.startReviewSession(now);
  actions.revealReviewAnswer();
  return { ...harness, actions, scheduler, persistReviewGrade, computing: computing.promise, saving: saving.promise,
    releaseCompute: computed.resolve, releaseSave: saved.resolve };
}

export function snapshot() { return loadWorkspaceSnapshot({ includeBody: true })!; }
export function reopen() {
  closeDatabaseConnection();
  initializeDatabase();
  return snapshot();
}
export function facts() {
  return openDatabaseConnection().driver.queryAll<{ op_id: string; kind: string; node_id: string; grade: number }>(
    'SELECT op_id, kind, node_id, grade FROM review_log ORDER BY reviewed_at, op_id');
}

export function externalGrade(nodeId: string) {
  const reviewedAt = '2026-10-26T09:00:00.000Z';
  const card = toSchedulerCard(snapshot().nodesById[nodeId]!.review ?? null, reviewedAt);
  applyReviewGrade({ nodeId, opId: 'external-grade', grade: 2, reviewedAt,
    schedulerVersion: 'test', cardBefore: card, cardAfter: card });
  return snapshot().nodesById[nodeId]!.review!;
}

export function history(harness: Awaited<ReturnType<typeof prepare>>) {
  installWorkspaceHistoryPersistence({ persistNodeSnapshots: async () => false,
    persistReadingSnapshots: async () => false, persistShelveSnapshots: async () => false,
    persistReviewSnapshot: async (nodeId, review, updatedAt, mutation) => ({
      review: saveNodeReviewStateWithSync(openDatabaseConnection().driver, { nodeId, review, updatedAt,
        hostName: loadOrCreateDesktopHostName(updatedAt), ...(mutation ? { history: mutation } : {}) })
        ? snapshot().nodesById[nodeId]!.review ?? null : null
    }) });
  const actions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState(actions);
  return actions;
}

let currentCommit: (payload: unknown) => ReturnType<typeof commitDesktopDailyFlow>;
export async function invokeGradeRuntime(command: string, payload: unknown) {
  if (command === 'open_daily_flow') return openDesktopDailyFlow(payload);
  if (command === 'commit_daily_flow') return currentCommit(payload);
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected grade command: ${command}`);
}
