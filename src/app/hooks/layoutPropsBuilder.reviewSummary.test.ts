import { expect, it, vi } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import type { ReviewSessionState } from '../../store/workspaceStore';

import { buildLayoutProps, countCreatedNodesDuringSession } from './layoutPropsBuilder';
import { createNode, reviewGateLayoutArgs } from './layoutPropsBuilder.reviewSummary.testSupport';
import type { BuildLayoutPropsArgs } from './layoutPropsBuilderTypes';

it('counts created items and topics inside the completed review session window', () => {
  const reviewSession: ReviewSessionState = {
    completedAt: '2026-03-03T12:30:00.000Z',
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    sessionStartedAt: '2026-03-03T12:00:00.000Z',
    totalNodeCount: 1
  };

  expect(countCreatedNodesDuringSession(reviewSession, {
    folder: createNode('folder', 'folder', '2026-03-03T12:10:00.000Z'),
    item: createNode('item', 'item', '2026-03-03T12:18:00.000Z'),
    late: createNode('late', 'topic', '2026-03-03T12:31:00.000Z'),
    topic: createNode('topic', 'topic', '2026-03-03T12:20:00.000Z')
  })).toEqual({ createdItemCount: 1, createdTopicCount: 1 });
});

it('does not derive review queue state from default scheduler settings before settings are ready', () => {
  const startReviewSession = vi.fn(() => true);
  const props = buildLayoutProps({
    ...reviewGateLayoutArgs,
    startReviewSession,
  } as unknown as BuildLayoutPropsArgs);

  expect(props.review.canStartStudyMode).toBe(false);
  expect(props.review.reviewPanelQueueNodeIds).toEqual([]);
  expect(props.review.reviewFlowWindow).toEqual({
    dayBuckets: [],
    dayOffsetByNodeId: {},
    queueNodeIds: [],
    readyNodeIds: [],
    upcomingNodeIds: []
  });
  expect(props.review.reviewQueueNodeIds).toEqual([]);
  expect(props.review.reviewQueueCount).toBe(0);

  props.review.onStartStudyMode();
  expect(startReviewSession).not.toHaveBeenCalled();
});

it('does not enter review mode from the explicit exit action', () => {
  const exitReviewSession = vi.fn();
  const exitStudyMode = vi.fn();
  const onOpenNotesView = vi.fn();
  const startReviewSession = vi.fn(() => false);
  const props = buildLayoutProps({
    ...reviewGateLayoutArgs,
    exitReviewSession,
    exitStudyMode,
    isStudyMode: false,
    onOpenNotesView,
    reviewSettings: {
      isReviewSchedulerSettingsReady: true,
      reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
    },
    startReviewSession
  } as unknown as BuildLayoutPropsArgs);

  props.review.onExitReviewMode();

  expect(exitReviewSession).toHaveBeenCalledTimes(1);
  expect(exitStudyMode).toHaveBeenCalledTimes(1);
  expect(onOpenNotesView).toHaveBeenCalledTimes(1);
  expect(startReviewSession).not.toHaveBeenCalled();
});

it('changes review session mode with the controller clock', () => {
  const nowIso = '2026-06-21T12:00:00.000Z';
  const setReviewSessionMode = vi.fn();
  const props = buildLayoutProps({
    ...reviewGateLayoutArgs,
    nowIso,
    reviewSettings: {
      isReviewSchedulerSettingsReady: true,
      reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
    },
    setReviewSessionMode
  } as unknown as BuildLayoutPropsArgs);

  props.review.onSetReviewSessionMode('reading-only');

  expect(setReviewSessionMode).toHaveBeenCalledWith('reading-only', nowIso);
});

it('continues queue-clear reading through the current Flow checkpoint', async () => {
  const nowIso = '2026-06-21T12:00:00.000Z';
  const onOpenNotesView = vi.fn();
  const onSelectNode = vi.fn();
  const continueReviewSessionReading = vi.fn(() => true);
  const exitReviewSession = vi.fn();
  const props = buildLayoutProps({
    ...reviewGateLayoutArgs,
    activeNodeId: 'review-1',
    continueReviewSessionReading,
    exitReviewSession,
    isStudyMode: true,
    nav: { onSelectNode },
    nodesById: {
      ...reviewGateLayoutArgs.nodesById,
      'reading-1': createNode('reading-1', 'topic', nowIso)
    },
    nowIso,
    onOpenNotesView,
    reviewSession: {
      completedAt: nowIso,
      continueNodeId: 'reading-1',
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      reviewedItemCount: 1,
      totalNodeCount: 1
    },
    reviewSettings: {
      isReviewSchedulerSettingsReady: true,
      reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
    },
    startReviewSession: vi.fn(() => false)
  } as unknown as BuildLayoutPropsArgs);

  await props.review.onContinueReading();

  expect(onOpenNotesView).toHaveBeenCalledTimes(1);
  expect(onSelectNode).not.toHaveBeenCalled();
  expect(continueReviewSessionReading).toHaveBeenCalledWith(nowIso);
  expect(exitReviewSession).not.toHaveBeenCalled();
});

it('does not mark a pure reading completion as queue-clear continuation', () => {
  const nowIso = '2026-06-21T12:00:00.000Z';
  const props = buildLayoutProps({
    ...reviewGateLayoutArgs,
    activeNodeId: 'reading-1',
    nodesById: {
      ...reviewGateLayoutArgs.nodesById,
      'reading-1': createNode('reading-1', 'topic', nowIso)
    },
    reviewFlowWindow: undefined,
    reviewSession: {
      completedAt: nowIso,
      continueNodeId: 'reading-1',
      currentNodeId: null,
      isAnswerRevealed: false,
      queueNodeIds: [],
      readTopicCount: 1,
      reviewedItemCount: 0,
      totalNodeCount: 1
    },
    reviewSettings: {
      isReviewSchedulerSettingsReady: true,
      reviewSchedulerSettings: DEFAULT_REVIEW_SCHEDULER_SETTINGS
    }
  } as unknown as BuildLayoutPropsArgs);

  expect(props.review.reviewSummary.canContinueReading).toBe(false);
});

it('exits Flow in place without restoring the browse list or selecting another document', () => {
  const exitReviewSession = vi.fn();
  const exitStudyMode = vi.fn();
  const onOpenNotesView = vi.fn();
  const onSelectNode = vi.fn();
  const props = buildLayoutProps({ ...reviewGateLayoutArgs, exitReviewSession, exitStudyMode,
    onOpenNotesView, onSelectNode } as unknown as BuildLayoutPropsArgs);
  expect(props.review.onExitFlowHere).toBeDefined();
  props.review.onExitFlowHere?.();
  expect(exitReviewSession).toHaveBeenCalledOnce();
  expect(exitStudyMode).toHaveBeenCalledOnce();
  expect(onOpenNotesView).not.toHaveBeenCalled();
  expect(onSelectNode).not.toHaveBeenCalled();
});

it.each([true, false])('keeps daily continuation under the save owner when navigation returns %s', async saved => {
  const onSelectNode = vi.fn();
  const onOpenNotesView = vi.fn();
  const exitReviewSession = vi.fn();
  const continueReviewSessionReading = vi.fn(async () => saved);
  const props = buildLayoutProps({ ...reviewGateLayoutArgs, continueReviewSessionReading, exitReviewSession,
    onOpenNotesView, nav: { onSelectNode }, nodesById: { 'reading-1': createNode('reading-1', 'topic', '2026-06-21T12:00:00.000Z') },
    reviewSession: { completedAt: '2026-06-21T12:00:00.000Z', currentNodeId: null, continueNodeId: 'reading-1',
      queueNodeIds: [], isAnswerRevealed: false, totalNodeCount: 1, reviewedItemCount: 1,
      daily: { scope: 'library', dayKey: '2026-06-21T00:00:00.000Z', revision: 2 } }
  } as unknown as BuildLayoutPropsArgs);
  await props.review.onContinueReading();
  expect(continueReviewSessionReading).toHaveBeenCalledWith(reviewGateLayoutArgs.nowIso);
  expect(exitReviewSession).not.toHaveBeenCalled();
  expect(onSelectNode).not.toHaveBeenCalled();
  expect(onOpenNotesView).toHaveBeenCalledTimes(saved ? 1 : 0);
});
