import { useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { sameCycleProgress } from '../../lib/core/flow/cycleFlowState';
import { getReviewItemKind } from '../features/review/model/reviewItemKind';
import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { openCompanionDailyFlowForDisplay as openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { saveCompanionFlowResume } from '../shared/platform/companion/runtime/companionFlowResume';
import type { CompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { isCanonicalVisibleNodeId } from '../shared/workspaceCanonicalSelectors';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

import { continueCompanionDailyFlow } from './companionDailyNavigation';
import { createCompanionFlowControls, trackCompanionFlowRefresh } from './companionFlowControls';
import { buildCurrentCard, emptyCompanionReviewSession, resolveScheduledReviewSummary } from './companionReviewSession';
import { useCompanionFlowDocumentPrefetch } from './useCompanionFlowDocumentPrefetch';
import { useFlowHydration } from './useCompanionFlowHydration';
import { useCompanionFlowReadView } from './useCompanionFlowReadView';

export type FlowOwner = { identity: string; scope: object; session: ReturnType<typeof createEmptyReviewSession>;
  reconciledSession?: ReturnType<typeof createEmptyReviewSession>;
  refresh?: Promise<void>; readIntents?: CompanionReadIntents; readEpoch?: number;
  generation: number; epoch: number; hydrated: boolean; error: string | null; kind: string | null;
  snapshot: WorkspaceSnapshot | null };

export function useCompanionFlowSession(args: {
  snapshot: WorkspaceSnapshot | null; ready: boolean; active: boolean; onlyReview: boolean; libraryScope: string;
}) {
  const [, render] = useReducer((value: number) => value + 1, 0);
  const scope = useSyncExternalStore(subscribeCompanionReadingScope, getCompanionReadingScope);
  const identity = JSON.stringify([args.libraryScope, args.onlyReview]);
  const owner = useRef<FlowOwner>({ identity, scope, session: createEmptyReviewSession(), generation: 0, epoch: 0,
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
  reconcileCurrentFlow(args.snapshot, current);
  useFlowHydration(args, current, owner, latest, identity, scope, mode, render);
  useFlowReentry(args, current, owner, latest, mode, render);
  useEffect(() => {
    if (!current.hydrated) return;
    void saveCompanionFlowResume(args.libraryScope, args.onlyReview, current.session.currentNodeId).catch((error: unknown) => {
      if (owner.current !== current) return;
      current.error = error instanceof Error ? error.message : 'Could not save the Flow position.';
      render();
    });
  }, [identity, current.hydrated, current.session.currentNodeId]);
  useEffect(() => {
    if (!args.active || !current.hydrated || !current.session.daily || current.readIntents?.pending) return;
    const source = current.session;
    const generation = current.generation;
    trackCompanionFlowRefresh(current, openCompanionDailyFlow({ now: new Date().toISOString(), mode, preserveCurrent: true }).then(saved => {
      if (owner.current !== current || !latest.current.active || current.readIntents?.pending || current.generation !== generation || (saved.session.daily?.revision === source.daily?.revision && saved.session.daily?.dayKey === source.daily?.dayKey && saved.session.daily?.scope === source.daily?.scope)) return;
      current.session = { ...saved.session, isAnswerRevealed:
        saved.session.currentNodeId === source.currentNodeId && current.session.isAnswerRevealed };
      if (!sameCycleProgress(saved.session, source)) current.generation += 1;
      render();
    }).catch(error => { current.error = String(error); render(); }));
  }, [args.snapshot?.nodesById]);
  useReadIntentReceipts(current, owner, mode, render);
  const session = current.session;
  const { scheduled, hasTopics } = useFlowCatalogSummary(args.snapshot, Boolean(session.currentNodeId));
  const view = useMemo(() => flowView(args.snapshot, current, scheduled),
    [args.snapshot, current.hydrated, session, scheduled]);
  const cancelDocumentPreparation = useCompanionFlowDocumentPrefetch(args.active && args.ready && current.hydrated ? args.snapshot : null,
    session);
  const dailyView = useCompanionFlowReadView(args.active, current.hydrated, current.session, mode, args.libraryScope);
  const canContinueReading = dailyView?.view?.canContinueReading ?? false;
  const historyKey = companionFlowHistoryKey(args.libraryScope);
  const controls = createCompanionFlowControls({ current, owner, scope, mode, historyKey, render });
  function continueReading() { cancelDocumentPreparation(); if (owner.current === current) void continueCompanionDailyFlow(latest.current, current, owner, mode, render).catch(error => { current.error = String(error); render(); }); }
  return { view, ...controls, historyKey, cancelDocumentPreparation, continueReading, canContinueReading, hasTopics,
    readIntents: current.readIntents,
    summary: { ...(session.cycle ? { queueCleared: Boolean(session.cycle.clearedAt) } : {}), completedAt: session.completedAt ?? null, sessionStartedAt: session.sessionStartedAt ?? null,
      readTopicCount: session.readTopicCount ?? 0, readingElapsedMs: session.readingElapsedMs ?? 0,
      reviewedItemCount: session.reviewedItemCount ?? 0, reviewElapsedMs: session.reviewElapsedMs ?? 0 },
    isAnswerRevealed: session.isAnswerRevealed, error: current.error ?? dailyView?.error ?? null, ready: current.hydrated };
}

function useFlowCatalogSummary(snapshot: WorkspaceSnapshot | null, hasCurrent: boolean) {
  // Catalog-wide scheduled counts are displayed only on the empty Flow surfaces.
  const catalog = useFlowCatalog(hasCurrent ? null : snapshot);
  const scheduled = useMemo(() => catalog ? resolveScheduledReviewSummary(catalog) : {
    nextFsrsDueAt: null, nextReadingDueAt: null, scheduledFsrsCount: 0, scheduledReadingCount: 0
  }, [catalog]);
  const hasTopics = useMemo(() => hasCurrent || Boolean(catalog && catalog.nodeOrder.some((id) => {
    if (!isCanonicalVisibleNodeId(catalog, id)) return false;
    const kind = catalog.nodesById[id]?.kind;
    return kind === 'topic' || kind === 'item';
  })), [catalog, hasCurrent]);
  return { scheduled, hasTopics };
}

function useFlowCatalog(snapshot: WorkspaceSnapshot | null) {
  const { nodesById, nodeOrder, trashedNodeIds, trashedNodeDeletedAtById } = snapshot ?? {};
  return useMemo(() => nodesById && nodeOrder && trashedNodeIds ? { nodesById, nodeOrder, trashedNodeIds,
    ...(trashedNodeDeletedAtById ? { trashedNodeDeletedAtById } : {}) } : null,
  [nodesById, nodeOrder, trashedNodeIds, trashedNodeDeletedAtById]);
}

function useFlowReentry(args: Parameters<typeof useCompanionFlowSession>[0],
  current: FlowOwner, owner: { current: FlowOwner }, latest: { current: Parameters<typeof useCompanionFlowSession>[0] },
  mode: 'review-first' | 'recommended', render: () => void) {
  const wasActive = useRef(args.active);
  useEffect(() => {
    if (args.active && !wasActive.current && current.hydrated && args.snapshot) {
      if (isAvailableNativeCompanionRuntime()) {
        const source = current.session;
        trackCompanionFlowRefresh(current, openCompanionDailyFlow({ now: new Date().toISOString(), mode }).then(saved => {
          if (owner.current !== current || !latest.current.active || current.session !== source) return;
          current.session = { ...saved.session, isAnswerRevealed:
            saved.session.currentNodeId === source.currentNodeId && source.isAnswerRevealed };
          current.generation += 1;
          render();
        }).catch(error => { current.error = String(error); render(); }));
      }
      current.generation += 1;
      current.epoch += 1;
      render();
    }
    wasActive.current = args.active;
  }, [args.active]);
}

function flowView(snapshot: WorkspaceSnapshot | null, current: FlowOwner,
  scheduled: ReturnType<typeof resolveScheduledReviewSummary> | null) {
  const session = current.session;
  const queueNodeIds = session.currentNodeId
    ? [session.currentNodeId, ...session.queueNodeIds.filter((id) => id !== session.currentNodeId)] : [];
  return snapshot && current.hydrated && scheduled ? {
    ...scheduled, queueNodeIds,
    currentCard: buildCurrentCard(snapshot, queueNodeIds), totalCount: session.totalNodeCount
  } : emptyCompanionReviewSession();
}

function reconcileCurrentFlow(snapshot: WorkspaceSnapshot | null, current: FlowOwner) {
  if (snapshot && current.hydrated) {
    const previousNodeId = current.session.currentNodeId;
    if (current.snapshot !== snapshot || current.reconciledSession !== current.session) {
      current.reconciledSession = current.session;
      current.snapshot = snapshot;
    }
    const kind = getReviewItemKind(snapshot.nodesById[current.session.currentNodeId ?? '']);
    if (previousNodeId !== current.session.currentNodeId || (current.kind !== null && current.kind !== kind)) {
      current.generation += 1;
      current.session.isAnswerRevealed = false;
    }
    current.kind = kind;
  }
}

function useReadIntentReceipts(current: FlowOwner, owner: { current: FlowOwner },
  mode: 'recommended' | 'review-first', render: () => void) {
  useEffect(() => current.readIntents?.subscribe(() => {
    current.error = current.readIntents!.error;
    const result = current.readIntents!.result;
    if (owner.current !== current) return;
    const displayed = current.session.daily;
    const received = result?.session.daily;
    const sameDay = received?.scope === displayed?.scope && received?.dayKey === displayed?.dayKey;
    const currentReceipt = sameDay && received && received.revision >= (displayed?.revision ?? 0);
    const correction = current.readIntents!.corrected && current.readEpoch === current.epoch;
    if (!current.readIntents!.pending && result?.mode === mode &&
      (correction || (currentReceipt && result.session.currentNodeId === current.session.currentNodeId))) {
      current.session = { ...result.session, isAnswerRevealed: current.session.isAnswerRevealed };
    }
    render();
  }), [current.readIntents]);
}
