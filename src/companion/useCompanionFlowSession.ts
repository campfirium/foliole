import { useEffect, useReducer, useRef, useSyncExternalStore } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { getReviewItemKind } from '../features/review/model/reviewItemKind';
import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { loadCompanionFlowResume, saveCompanionFlowResume } from '../shared/platform/companion/runtime/companionFlowResume';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { selectCanonicalVisibleNodeIds } from '../shared/workspaceCanonicalSelectors';
import { getWorkspaceHistoryTopEntry } from '../store/workspaceActionHistoryState';
import { flowState, reconcileFlowSession, resumeFlowSession } from '../store/workspaceFlowSession';
import { cloneWorkspaceReviewSession } from '../store/workspaceHistoryContext';
import { buildReviewFlowWindow } from '../store/workspaceReviewFlowWindow';
import { resolveWorkspaceReviewHistoryTarget } from '../store/workspaceReviewHistoryTarget';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';
import { canContinueReadingInFlowWindow, continueReviewSessionReading } from '../store/workspaceReviewReadingContinuation';

import { createCompanionFlowControls } from './companionFlowControls';
import { buildCurrentCard, emptyCompanionReviewSession, resolveScheduledReviewSummary } from './companionReviewSession';

export type FlowOwner = { identity: string; scope: object; session: ReturnType<typeof createEmptyReviewSession>;
  generation: number; epoch: number; hydrated: boolean; error: string | null; kind: string | null;
  snapshot: WorkspaceSnapshot | null };

export function useCompanionFlowSession(args: {
  snapshot: WorkspaceSnapshot | null; ready: boolean; active: boolean; onlyReview: boolean; libraryScope: string;
}) {
  const [, render] = useReducer((value: number) => value + 1, 0);
  const scope = useSyncExternalStore(subscribeCompanionReadingScope, getCompanionReadingScope);
  const identity = JSON.stringify([args.libraryScope, args.onlyReview]);
  const owner = useRef({ identity, scope, session: createEmptyReviewSession(), generation: 0, epoch: 0,
    hydrated: false, error: null as string | null, kind: null as string | null,
    snapshot: null as WorkspaceSnapshot | null });
  if (owner.current.identity !== identity || owner.current.scope !== scope) owner.current = {
    identity, scope, session: createEmptyReviewSession(), generation: owner.current.generation + 1, epoch: owner.current.epoch + 1,
    hydrated: false, error: null, kind: null, snapshot: null
  };
  const current = owner.current;
  const latest = useRef(args);
  latest.current = args;
  const mode = args.onlyReview ? 'review-first' : 'recommended';
  reconcileCurrentFlow(args.snapshot, current, mode, args.active);
  useFlowHydration(args, current, owner, latest, identity, scope, mode, render);
  useFlowReentry(args, current, mode, render);
  useEffect(() => {
    if (!current.hydrated) return;
    void saveCompanionFlowResume(args.libraryScope, args.onlyReview, current.session.currentNodeId).catch((error: unknown) => {
      if (owner.current !== current) return;
      current.error = error instanceof Error ? error.message : 'Could not save the Flow position.';
      render();
    });
  }, [identity, current.hydrated, current.session.currentNodeId]);
  const session = current.session;
  const view = flowView(args.snapshot, current);
  const canContinueReading = canContinueFlowReading(args.snapshot, current, args.onlyReview);
  const hasTopics = Boolean(args.snapshot && selectCanonicalVisibleNodeIds(args.snapshot).some((id) => {
    const kind = args.snapshot?.nodesById[id]?.kind;
    return kind === 'topic' || kind === 'item';
  }));
  const historyKey = companionFlowHistoryKey(args.libraryScope);
  const controls = createCompanionFlowControls({ current, owner, scope, mode, historyKey, render });
  function continueReading() { if (owner.current === current) continueCurrentFlow(latest.current, current, mode, render); }
  return { view, ...controls, historyKey, continueReading, canContinueReading, hasTopics,
    summary: { completedAt: session.completedAt ?? null, sessionStartedAt: session.sessionStartedAt ?? null,
      readTopicCount: session.readTopicCount ?? 0, readingElapsedMs: session.readingElapsedMs ?? 0,
      reviewedItemCount: session.reviewedItemCount ?? 0, reviewElapsedMs: session.reviewElapsedMs ?? 0 },
    isAnswerRevealed: session.isAnswerRevealed, error: current.error, ready: current.hydrated };
}

function continueCurrentFlow(args: Parameters<typeof useCompanionFlowSession>[0], current: FlowOwner,
  mode: 'review-first' | 'recommended', render: () => void) {
  if (!args.active || current.scope !== getCompanionReadingScope() ||
    !canContinueFlowReading(args.snapshot, current, args.onlyReview) || !args.snapshot) return;
  const next = continueReviewSessionReading(flowState(args.snapshot, current.session, mode), new Date().toISOString());
  if (!next) return;
  current.session = next;
  current.generation += 1;
  render();
}

function canContinueFlowReading(snapshot: WorkspaceSnapshot | null, current: FlowOwner, onlyReview: boolean) {
  if (!snapshot || !current.hydrated || onlyReview || current.session.currentNodeId) return false;
  const state = flowState(snapshot, current.session, 'recommended');
  return canContinueReadingInFlowWindow({ reviewedItemCount: current.session.reviewedItemCount ?? 0,
    continueNodeId: current.session.continueNodeId ?? null },
  buildReviewFlowWindow(state, new Date().toISOString(), current.session.queueNodeIds));
}

function useFlowReentry(args: Parameters<typeof useCompanionFlowSession>[0],
  current: FlowOwner, mode: 'review-first' | 'recommended', render: () => void) {
  const wasActive = useRef(args.active);
  useEffect(() => {
    if (args.active && !wasActive.current && current.hydrated && args.snapshot) {
      if (!current.session.currentNodeId) {
        current.session = resumeFlowSession(args.snapshot, mode, null, new Date().toISOString());
      }
      current.generation += 1;
      current.epoch += 1;
      render();
    }
    wasActive.current = args.active;
  }, [args.active]);
}

function useFlowHydration(
  args: Parameters<typeof useCompanionFlowSession>[0],
  current: FlowOwner,
  owner: { current: FlowOwner },
  latest: { current: Parameters<typeof useCompanionFlowSession>[0] },
  identity: string, scope: object, mode: 'review-first' | 'recommended', render: () => void
) {
  useEffect(() => {
    if (!args.ready || !args.snapshot) return;
    let cancelled = false;
    void Promise.all([loadCompanionFlowResume(args.libraryScope, args.onlyReview),
      isAvailableNativeCompanionRuntime() ? loadCompanionFlowHistory(companionFlowHistoryKey(args.libraryScope)) : null
    ]).then(([preferred, history]) => {
      if (cancelled || owner.current !== current || !latest.current.snapshot) return;
      current.session = resumeFlowSession(latest.current.snapshot, mode, preferred, new Date().toISOString());
      const entry = history && (getWorkspaceHistoryTopEntry(history, 'undo') ?? getWorkspaceHistoryTopEntry(history, 'redo'));
      if (entry?.type === 'nodes.change') {
        const saved = history!.undoStack.length ? entry.afterSession : entry.beforeSession;
        if (saved?.currentNodeId === preferred) current.session = cloneWorkspaceReviewSession(saved);
      }
      if (entry && (entry.type === 'review.grade' || entry.type === 'topic.dismiss')) {
        const replayMode = history!.undoStack.length ? 'undo' : 'redo';
        const context = replayMode === 'undo' ? entry.afterContext : entry.beforeContext;
        if (context.reviewSession.currentNodeId === preferred &&
          resolveWorkspaceReviewHistoryTarget({ ...latest.current.snapshot, entry, mode: replayMode,
          reviewSession: context.reviewSession })) current.session = cloneWorkspaceReviewSession(context.reviewSession);
      }
      current.hydrated = true;
      render();
    }).catch((error: unknown) => {
      if (cancelled) return;
      current.error = error instanceof Error ? error.message : 'Could not restore Flow.';
      if (latest.current.snapshot) current.session = resumeFlowSession(latest.current.snapshot, mode, null, new Date().toISOString());
      current.hydrated = true;
      render();
    });
    return () => { cancelled = true; };
  }, [identity, scope, args.ready, Boolean(args.snapshot)]);
}

function flowView(snapshot: WorkspaceSnapshot | null, current: FlowOwner) {
  const session = current.session;
  const queueNodeIds = session.currentNodeId
    ? [session.currentNodeId, ...session.queueNodeIds.filter((id) => id !== session.currentNodeId)] : [];
  return snapshot && current.hydrated ? {
    ...resolveScheduledReviewSummary(snapshot), queueNodeIds,
    currentCard: buildCurrentCard(snapshot, queueNodeIds), totalCount: session.totalNodeCount
  } : emptyCompanionReviewSession();
}

function reconcileCurrentFlow(snapshot: WorkspaceSnapshot | null, current: FlowOwner,
  mode: 'review-first' | 'recommended', active: boolean) {
  if (snapshot && current.hydrated) {
    const previousNodeId = current.session.currentNodeId;
    const refreshedAt = active && current.snapshot !== snapshot ? new Date().toISOString() : undefined;
    current.session = reconcileFlowSession(snapshot, current.session, mode, refreshedAt);
    current.snapshot = snapshot;
    const kind = getReviewItemKind(snapshot.nodesById[current.session.currentNodeId ?? '']);
    if (previousNodeId !== current.session.currentNodeId || (current.kind !== null && current.kind !== kind)) {
      current.generation += 1;
      current.session.isAnswerRevealed = false;
    }
    current.kind = kind;
  }
}
