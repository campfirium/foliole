import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveNodeReadingStateToRuntime } from '../shared/platform/runtime/nodeReadingStateRuntimeRepository';
import { createDurableReviewHarness, getGuardrailInvoke, guardrailNow, readGuardrailStorage,
  reopenGuardrailFlow, startGuardrailDatabase, stopGuardrailDatabase } from '../test/workspaceDurableGuardrail.test-support';

import { installWorkspaceHistoryPersistence, resetWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import {
  syncRelearnNodeToRuntime,
  syncReviewGradeToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createQaNode,
  createReadingNode,
  createSetStateHarness,
  createWorkspaceFixture
} from './workspaceStoreReviewActions.test-support';

vi.mock('../shared/platform/runtime/nodeReadingStateRuntimeRepository', () => ({
  saveNodeReadingStateToRuntime: vi.fn(async () => true)
}));

vi.mock('./workspaceRuntimeSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceRuntimeSync')>();
  return {
    ...actual,
    syncNodeContentToRuntime: vi.fn(),
    syncRelearnNodeToRuntime: vi.fn(() => true),
    syncReviewGradeToRuntime: vi.fn()
  };
});

const persistReadingSnapshots = vi.fn(async () => true);
const persistShelveSnapshots = vi.fn(async () => true);

beforeEach(() => {
  installWorkspaceHistoryPersistence({
    persistNodeSnapshots: async () => true,
    persistReadingSnapshots,
    persistReviewSnapshot: async () => true,
    persistShelveSnapshots
  });
});

afterEach(() => resetWorkspaceHistoryPersistence());

function createReadingHarness() {
  return createSetStateHarness(createWorkspaceFixture([createReadingNode('reading-1', '2026-03-03T00:00:00.000Z')]));
}

function createFsrsHarness() {
  return createSetStateHarness(createWorkspaceFixture([createQaNode('qa-1', '2026-03-03T00:00:00.000Z')]));
}

describe('workspace durable node mutation guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncReviewGradeToRuntime).mockImplementation(async payload => ({ card: payload.cardAfter }));
  });

  it('requires runtime sync for reading dismiss from the node menu', () => {
    const harness = createReadingHarness();
    const actions = createWorkspaceNodeActions(harness.setState);

    expect(actions.dismissNode('reading-1', '2026-03-18T00:00:00.000Z')).toBe(true);
    expect(persistReadingSnapshots).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'reading-1', reading: expect.objectContaining({ state: 'dismissed' }) })],
      '2026-03-18T00:00:00.000Z'
    );
  });

  it('requires runtime sync for reading relearn reset', () => {
    const harness = createReadingHarness();
    const actions = createWorkspaceNodeActions(harness.setState);

    expect(actions.relearnNode('reading-1', '2026-03-18T00:00:00.000Z')).toBe(true);
    expect(saveNodeReadingStateToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'reading-1', reading: null })
    );
  });

  it('requires runtime sync for topic shelve from the node menu', () => {
    const harness = createReadingHarness();
    const actions = createWorkspaceNodeActions(harness.setState);

    expect(actions.shelveNode('reading-1', '2026-03-18T00:00:00.000Z')).toBe(true);
    expect(persistShelveSnapshots).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'reading-1', shelvedAt: '2026-03-18T00:00:00.000Z' })],
      '2026-03-18T00:00:00.000Z'
    );
  });

  it('requires runtime sync for fsrs relearn reset', () => {
    const harness = createFsrsHarness();
    const actions = createWorkspaceNodeActions(harness.setState);

    expect(actions.relearnNode('qa-1', '2026-03-18T00:00:00.000Z')).toBe(true);
    expect(syncRelearnNodeToRuntime).toHaveBeenCalledWith({ nodeId: 'qa-1' });
  });
});

describe('workspace durable Daily Flow review mutation guardrails', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await startGuardrailDatabase();
  });
  afterEach(stopGuardrailDatabase);

  it.each(['read', 'later', 'dismiss'] as const)('persists reading %s with its Daily Flow cursor', async action => {
    const harness = createDurableReviewHarness('topic');
    expect(await harness.actions.startReviewSession(guardrailNow)).toBe(true);
    const before = harness.getState().reviewSession;
    const nodeId = before.currentNodeId!;
    expect(nodeId).toBeTruthy();
    const execute = { read: harness.actions.readReviewTopic, later: harness.actions.postponeReviewTopic,
      dismiss: harness.actions.dismissReviewTopic };
    await expect(execute[action](guardrailNow)).resolves.toBe(true);
    const after = harness.getState().reviewSession;
    const reading = harness.getState().nodesById[nodeId]!.reading!;
    expect(reading).toMatchObject({ state: action === 'dismiss' ? 'dismissed' : 'active', lastHandledAt: guardrailNow });
    expect(after.currentNodeId).not.toBe(nodeId);
    expect(getGuardrailInvoke()).toHaveBeenCalledWith('commit_daily_flow', expect.objectContaining({
      readingAction: action, readings: [expect.objectContaining({ nodeId, after: reading })]
    }));
    expect(getGuardrailInvoke().mock.calls.filter(([command]) => command === 'commit_daily_flow')).toHaveLength(1);
    expect(saveNodeReadingStateToRuntime).not.toHaveBeenCalled();
    expect(readGuardrailStorage(nodeId)).toMatchObject({ node: { reading }, operations: [expect.anything()], reviews: [] });
    const reopened = await reopenGuardrailFlow();
    expect(reopened.session.currentNodeId).toBe(after.currentNodeId);
    expect(reopened.session.daily).toEqual(after.daily);
    expect(readGuardrailStorage(nodeId).node.reading).toEqual(reading);
  });

  it('persists fsrs grading with its Daily Flow cursor', async () => {
    const harness = createDurableReviewHarness('item');
    expect(await harness.actions.startReviewSession(guardrailNow)).toBe(true);
    const nodeId = harness.getState().reviewSession.currentNodeId!;
    expect(nodeId).toBeTruthy();
    harness.actions.revealReviewAnswer();
    await expect(harness.actions.gradeReviewCard(3, guardrailNow)).resolves.toBe(true);
    const after = harness.getState().reviewSession;
    const review = harness.getState().nodesById[nodeId]!.review!;
    expect(review).toMatchObject({ reps: 1, lastReviewAt: guardrailNow });
    expect(after.currentNodeId).not.toBe(nodeId);
    expect(getGuardrailInvoke()).toHaveBeenCalledWith('commit_daily_flow', expect.objectContaining({
      grade: expect.objectContaining({ nodeId, grade: 3, reviewedAt: guardrailNow })
    }));
    expect(getGuardrailInvoke().mock.calls.filter(([command]) => command === 'commit_daily_flow')).toHaveLength(1);
    expect(syncReviewGradeToRuntime).not.toHaveBeenCalled();
    expect(readGuardrailStorage(nodeId)).toMatchObject({ node: { review }, operations: [expect.anything()],
      reviews: [{ node_id: nodeId, grade: 3, kind: 'review' }] });
    const reopened = await reopenGuardrailFlow();
    expect(reopened.session.currentNodeId).toBe(after.currentNodeId);
    expect(reopened.session.daily).toEqual(after.daily);
    expect(readGuardrailStorage(nodeId).node.review).toEqual(review);
  });
});
