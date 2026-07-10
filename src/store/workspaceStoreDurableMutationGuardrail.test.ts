import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  syncNodeContentToRuntime,
  syncNodeContentToRuntimeNow,
  syncRelearnNodeToRuntime,
  syncReviewGradeToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import {
  createQaNode,
  createReadingNode,
  createSchedulerGradeMock,
  createSetStateHarness,
  createWorkspaceFixture,
  previewStub
} from './workspaceStoreReviewActions.test-support';

vi.mock('./workspaceRuntimeSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspaceRuntimeSync')>();
  return {
    ...actual,
    syncNodeContentToRuntime: vi.fn(),
    syncNodeContentToRuntimeNow: vi.fn(async () => true),
    syncRelearnNodeToRuntime: vi.fn(() => true),
    syncReviewGradeToRuntime: vi.fn()
  };
});

function createReadingHarness() {
  return createSetStateHarness(createWorkspaceFixture([createReadingNode('reading-1', '2026-03-03T00:00:00.000Z')]));
}

function createFsrsHarness() {
  return createSetStateHarness(createWorkspaceFixture([createQaNode('qa-1', '2026-03-03T00:00:00.000Z')]));
}

describe('workspace durable node mutation guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncReviewGradeToRuntime).mockResolvedValue(undefined);
  });

  it('requires runtime sync for reading dismiss from the node menu', () => {
    const harness = createReadingHarness();
    const actions = createWorkspaceNodeActions(harness.setState);

    expect(actions.dismissNode('reading-1', '2026-03-18T00:00:00.000Z')).toBe(true);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reading-1', reading: expect.objectContaining({ state: 'dismissed' }) })
    );
  });

  it('requires runtime sync for reading relearn reset', () => {
    const harness = createReadingHarness();
    const actions = createWorkspaceNodeActions(harness.setState);

    expect(actions.relearnNode('reading-1', '2026-03-18T00:00:00.000Z')).toBe(true);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reading-1', reading: null })
    );
  });

  it('requires runtime sync for topic shelve from the node menu', () => {
    const harness = createReadingHarness();
    const actions = createWorkspaceNodeActions(harness.setState);

    expect(actions.shelveNode('reading-1', '2026-03-18T00:00:00.000Z')).toBe(true);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reading-1', shelvedAt: '2026-03-18T00:00:00.000Z' })
    );
  });

  it('requires runtime sync for fsrs relearn reset', () => {
    const harness = createFsrsHarness();
    const actions = createWorkspaceNodeActions(harness.setState);

    expect(actions.relearnNode('qa-1', '2026-03-18T00:00:00.000Z')).toBe(true);
    expect(syncRelearnNodeToRuntime).toHaveBeenCalledWith({ nodeId: 'qa-1' });
  });
});

describe('workspace durable reading review mutation guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncReviewGradeToRuntime).mockResolvedValue(undefined);
  });

  it('requires runtime sync for reading complete and defer actions', async () => {
    const completeHarness = createSetStateHarness(
      createWorkspaceFixture([
        createReadingNode('reading-1', '2026-03-03T00:00:00.000Z'),
        createReadingNode('reading-2', '2026-03-03T00:00:00.000Z')
      ])
    );
    const completeActions = createWorkspaceReviewActions(completeHarness.setState, completeHarness.getState, {
      grade: createSchedulerGradeMock(),
      preview: previewStub
    });

    completeActions.startReviewSession('2026-03-03T00:00:00.000Z');
    const completedNodeId = completeHarness.getState().reviewSession.currentNodeId;
    await expect(completeActions.readReviewTopic('2026-03-03T00:00:00.000Z')).resolves.toBe(true);
    expect(syncNodeContentToRuntimeNow).toHaveBeenCalledWith(
      expect.objectContaining({ id: completedNodeId, reading: expect.objectContaining({ state: 'active' }) })
    );

    vi.clearAllMocks();

    const deferHarness = createSetStateHarness(
      createWorkspaceFixture([
        createReadingNode('reading-1', '2026-03-03T00:00:00.000Z'),
        createReadingNode('reading-2', '2026-03-03T00:00:00.000Z')
      ])
    );
    const postponeReviewTopicActions = createWorkspaceReviewActions(deferHarness.setState, deferHarness.getState, {
      grade: createSchedulerGradeMock(),
      preview: previewStub
    });

    postponeReviewTopicActions.startReviewSession('2026-03-03T00:00:00.000Z');
    const deferredNodeId = deferHarness.getState().reviewSession.currentNodeId;
    await expect(postponeReviewTopicActions.postponeReviewTopic()).resolves.toBe(true);
    expect(syncNodeContentToRuntimeNow).toHaveBeenCalledWith(
      expect.objectContaining({ id: deferredNodeId, reading: expect.objectContaining({ state: 'active' }) })
    );
  });
});

describe('workspace durable reading review shelve and dismiss guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncReviewGradeToRuntime).mockResolvedValue(undefined);
  });

  it('requires runtime sync for reading dismiss inside review mode', async () => {
    const harness = createSetStateHarness(
      createWorkspaceFixture([
        createReadingNode('reading-1', '2026-03-03T00:00:00.000Z'),
        createReadingNode('reading-2', '2026-03-03T00:00:00.000Z')
      ])
    );
    const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
      grade: createSchedulerGradeMock(),
      preview: previewStub
    });

    actions.startReviewSession('2026-03-03T00:00:00.000Z');
    const dismissedNodeId = harness.getState().reviewSession.currentNodeId;
    await expect(actions.dismissReviewTopic('2026-03-03T00:00:00.000Z')).resolves.toBe(true);
    expect(syncNodeContentToRuntimeNow).toHaveBeenCalledWith(
      expect.objectContaining({ id: dismissedNodeId, reading: expect.objectContaining({ state: 'dismissed' }) })
    );
  });

});

describe('workspace durable fsrs review mutation guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(syncReviewGradeToRuntime).mockResolvedValue(undefined);
  });

  it('requires runtime sync for fsrs grading mutations', async () => {
    const harness = createSetStateHarness(
      createWorkspaceFixture([
        createQaNode('qa-1', '2026-03-03T00:00:00.000Z'),
        createQaNode('qa-2', '2026-03-03T00:00:00.000Z')
      ])
    );
    const actions = createWorkspaceReviewActions(harness.setState, harness.getState, {
      grade: createSchedulerGradeMock(),
      preview: previewStub
    });

    actions.startReviewSession('2026-03-03T00:00:00.000Z');
    actions.revealReviewAnswer();

    await expect(actions.gradeReviewCard(3, '2026-03-03T00:00:00.000Z')).resolves.toBe(true);
    expect(syncReviewGradeToRuntime).toHaveBeenCalledTimes(1);
  });
});
