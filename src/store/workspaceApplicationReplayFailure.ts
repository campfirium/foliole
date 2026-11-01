import { captureAnnotationHistoryFact, hashAnnotationValue } from '../../lib/core/nodes/annotationHistoryFacts';
import { readWorkspaceOperationLearning } from '../shared/platform/runtime/workspaceOperationLearning';
import { loadWorkspaceNodeDocumentFromRuntime } from '../shared/platform/workspaceRuntimeDocumentRepository';
import { loadWorkspaceListSnapshotFromRuntime } from '../shared/platform/workspaceRuntimeRepository';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { getApplicationHistoryTarget, settleApplicationReplay, updateApplicationOperation,
  type ApplicationOperation, type ApplicationReplay } from './workspaceApplicationHistory';
import { projectApplicationWorkspaceHistory } from './workspaceApplicationWorkspaceHistory';
import { isSameNodeReading, isSameNodeReview } from './workspaceNodeLearningComparison';
import { mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import type { WorkspaceState } from './workspaceStoreTypes';
import { isWorkspaceStructureHistoryApplicable } from './workspaceStructureHistoryApply';
import { resolveTopicReadingHistoryApply } from './workspaceTopicDismissActionHistory';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

/** Failure recovery reads canonical facts once; it never republishes a snapshot over current drafts. */
export async function replaySourceStillCanonical(operation: ApplicationOperation, request: ApplicationReplay, get: () => WorkspaceState) {
  const scope = get().libraryScope;
  try {
    const snapshot = await loadWorkspaceListSnapshotFromRuntime({ includePdfOpenings: false });
    if (!snapshot || get().libraryScope !== scope) return false;
    const native: WorkspaceState = { ...get(), nodeOrder: snapshot.nodeOrder,
      trashedNodeIds: snapshot.trashedNodeIds ?? [], trashedNodeDeletedAtById: snapshot.trashedNodeDeletedAtById ?? {},
      nodesById: Object.fromEntries(Object.entries(snapshot.nodesById).map(([id, node]) => [id, {
        ...node, anchorLink: node.anchorLink ? { id: node.anchorLink.id, kind: node.anchorLink.kind } : null
      }])) };
    if (operation.domain === 'editor') {
      const entry = operation.entry;
      if (entry.type === 'text.edit') {
        const id = entry.target?.nodeId ?? entry.nodeId;
        const document = await loadWorkspaceNodeDocumentFromRuntime(id);
        const state = get().editorOperationHistory.nativeTextStates[entry.nativeTargetKey];
        return get().libraryScope === scope && Boolean(document && state &&
          (entry.target?.field === 'reveal' ? document.reveal ?? '' : document.content) === state.doc.toString());
      }
      const deleting = (entry.type === 'annotation.create') === (request.direction === 'undo');
      for (const fact of entry.historyFacts ?? []) {
        if ((native.trashedNodeDeletedAtById[fact.nodeId] ?? null) !== (deleting ? null : entry.historyDeletedAt)) return false;
        const document = await loadWorkspaceNodeDocumentFromRuntime(fact.nodeId);
        const node = get().nodesById[fact.nodeId];
        if (!document || !node || hashAnnotationValue(captureAnnotationHistoryFact(mergeWorkspaceNodeDocument(node, document))) !== hashAnnotationValue(fact)) return false;
      }
      return get().libraryScope === scope && Boolean(entry.historyFacts?.length);
    }
    const entry = operation.entry;
    if (entry.type === 'structure.create' || entry.type === 'structure.delete' || entry.type === 'structure.move' || entry.type === 'structure.rename')
      return isWorkspaceStructureHistoryApplicable(native, entry, request.direction);
    if (entry.type === 'workspace.delete' || entry.type === 'workspace.restore') {
      const deletion = entry.type === 'workspace.delete' ? entry : entry.deletion;
      const trashed = (entry.type === 'workspace.delete') === (request.direction === 'undo');
      return deletion.nodeIds.every(id => Boolean(native.nodesById[id]) && native.trashedNodeIds.includes(id) === trashed &&
        (!trashed || native.trashedNodeDeletedAtById[id] === deletion.afterDeletedAtById[id]));
    }
    const ids = [entry.nodeId, ...('relatedReadings' in entry ? entry.relatedReadings ?? [] : []).map(value => value.nodeId)];
    const learning = await readWorkspaceOperationLearning(get().nodesById, ids, scope ?? get().reviewSession.daily?.scope);
    if (!learning || get().libraryScope !== scope) return false;
    if (entry.type === 'review.grade') return isSameNodeReview(learning[entry.nodeId], {
      review: request.direction === 'undo' ? entry.afterReview : entry.beforeReview });
    if (entry.type === 'topic.dismiss') {
      const apply = resolveTopicReadingHistoryApply(entry, request.direction);
      return isSameNodeReading(learning[entry.nodeId], { reading: apply.expectedReading }) &&
        apply.relatedReadings.every(value => isSameNodeReading(learning[value.nodeId], { reading: value.expectedReading }));
    }
    return (native.nodesById[entry.nodeId]?.shelvedAt ?? null) === (request.direction === 'undo' ? entry.afterShelvedAt : entry.beforeShelvedAt);
  } catch { return false; }
}

export async function finishApplicationReplayFailure(args: {
  get: () => WorkspaceState; set: Set; operation: ApplicationOperation; request: ApplicationReplay; sessionId: string;
}) {
  const { get, set, operation, request, sessionId } = args;
  const source = get().appActionHistory.application;
  const unchanged = source?.requests[0]?.stage === 'preparing' || await replaySourceStillCanonical(operation, request, get);
  if (get().appActionHistory.application?.sessionId !== sessionId) return;
  set(state => ({ appActionHistory: projectApplicationWorkspaceHistory(state.appActionHistory,
    settleApplicationReplay(state.appActionHistory.application!, request.id, { status: unchanged ? 'rejected' : 'indeterminate' })) }));
  const retry = async () => {
    if (!await replaySourceStillCanonical(operation, request, get) || get().appActionHistory.application?.sessionId !== sessionId) return;
    set(state => ({ appActionHistory: projectApplicationWorkspaceHistory(state.appActionHistory,
      updateApplicationOperation(state.appActionHistory.application!, { ...operation, blocked: false })) }));
    if (getApplicationHistoryTarget(get().appActionHistory.application!, request.direction)?.id === operation.id)
      (request.direction === 'undo' ? get().undoApplicationOperation : get().redoApplicationOperation)?.();
  };
  showAppRuntimeNotice(request.direction === 'undo' ? 'Undo could not be applied.' : 'Redo could not be applied.', 'error',
    unchanged ? undefined : { label: 'Retry', onSelect: () => { void retry(); } });
}
