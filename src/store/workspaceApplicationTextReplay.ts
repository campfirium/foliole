import { moveEditorOperationEntry, type EditorTextEditOperationEntry } from '../features/editor/model/editorOperationHistory';
import { createEditorTextReplaySave } from '../features/editor/model/editorTextReplaySave';
import { captureNativeTextHistory, runNativeTextHistory } from '../features/editor/model/nativeTextHistory';
import { getStoredAppLocale } from '../shared/localization/appLanguage';
import { translate } from '../shared/localization/translations';
import { loadWorkspaceNodeDocumentFromRuntime } from '../shared/platform/workspaceRuntimeDocumentRepository';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { applyWorkspaceTextHistory } from './workspaceEditorTextHistory';
import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import { hasWorkspaceNodeMutationRuntime } from './workspaceRuntimeSync';
import { drainPendingNodeContentRuntimePersist } from './workspaceStoreContentRuntimePersist';
import type { EditorOperationApplyContext, WorkspaceState } from './workspaceStoreTypes';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

export async function replayApplicationText(args: {
  get: () => WorkspaceState; set: Set; entry: EditorTextEditOperationEntry; mode: 'undo' | 'redo';
  signal?: AbortSignal; context?: EditorOperationApplyContext; isCurrent: () => boolean; beforeSubmit: () => boolean;
}) {
  const { entry, get, set } = args;
  const navigation = get().navigation;
  const active = get().activeNodeId;
  const nodeId = entry.target?.nodeId ?? entry.nodeId;
  if (!await drainPendingNodeContentRuntimePersist(nodeId) || !args.isCurrent()) return false;
  const document = hasWorkspaceNodeMutationRuntime() ? await loadWorkspaceNodeDocumentFromRuntime(nodeId) : null;
  if (!args.isCurrent()) return false;
  let node = get().nodesById[nodeId];
  if (!node || get().trashedNodeIds.includes(nodeId) || (hasWorkspaceNodeMutationRuntime() && !document)) return false;
  if (document) node = mergeWorkspaceNodeDocument(node, document);
  if (!isNodeDocumentLoaded(node)) return false;
  const nativeState = get().editorOperationHistory.nativeTextStates[entry.nativeTargetKey];
  const field = entry.target?.field ?? 'content';
  const content = field === 'reveal' ? node.reveal ?? '' : node.content;
  if (!nativeState || nativeState.doc.toString() !== content) return false;
  const prepared = { ...entry, nativeState };
  if (!args.beforeSubmit()) return false;
  set(state => ({ nodesById: { ...state.nodesById, [nodeId]: node! }, rendererBoundaryKeepNodeIds:
    [nodeId, ...state.rendererBoundaryKeepNodeIds.filter(id => id !== nodeId)].slice(0, 2) }));
  const contextContent = args.context?.getCurrentContent?.() ?? args.context?.currentContent;
  if (get().activeNodeId === nodeId && args.context?.nodeId === entry.nodeId && contextContent === content) {
    const applied = applyWorkspaceTextHistory({ entry: prepared, mode: args.mode, nodeId: entry.nodeId, context: args.context, set });
    if (applied) return typeof applied === 'object' && applied.persistence ? waitForReplaySave(applied.persistence, args.signal) : true;
    return false;
  }
  const tr = runNativeTextHistory(nativeState, args.mode, entry.nativeGroup);
  if (!tr) return false;
  const scope = get().libraryScope;
  const save = createEditorTextReplaySave(retry => {
    const locale = getStoredAppLocale();
    if (get().libraryScope === scope) showAppRuntimeNotice(translate(locale, 'desktop.feedback.saveFailed'), 'error',
      { label: translate(locale, 'desktop.feedback.retry'), onSelect: retry }, { durationMs: 30_000 });
  });
  const contentAfter = tr.newDoc.toString();
  const accepted = field === 'reveal'
    ? get().updateNodeReveal(nodeId, contentAfter, { historySave: save })
    : get().updateNodeContent(nodeId, contentAfter, {
      historySave: save, baseContent: content, baseVersionId: node.currentVersionId ?? null, deriveTitle: true
    });
  if (save.status === 'unbound' || save.status === 'rejected') { save.reject(); return false; }
  set(state => ({ editorOperationHistory: moveEditorOperationEntry(state.editorOperationHistory,
    entry.nodeId, args.mode, captureNativeTextHistory(tr.state)) }));
  if (args.isCurrent() && get().activeNodeId === active && get().navigation === navigation) get().setActiveNode(nodeId);
  if (!await accepted) return false;
  return waitForReplaySave(save.completion, args.signal);
}

function waitForReplaySave(completion: Promise<boolean>, signal?: AbortSignal) {
  if (!signal) return completion;
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>(resolve => {
    const aborted = () => resolve(false);
    signal.addEventListener('abort', aborted, { once: true });
    void completion.then(value => { signal.removeEventListener('abort', aborted); resolve(value); });
  });
}
