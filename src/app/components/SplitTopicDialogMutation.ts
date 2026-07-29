import type { SplitTopicPreviewPart } from '../../../lib/core/nodes/splitTopicModel';
import { buildSplitTopicNodeOrder } from '../../../lib/core/nodes/splitTopicModel';
import { saveSplitTopicPreferences } from '../../shared/platform/desktop/splitTopicPreferences';
import { saveSplitTopicWorkspaceMutation } from '../../shared/platform/workspaceRuntimeRepository';
import { sanitizeNavigationState } from '../../store/workspaceNavigation';
import { createWorkspaceNodeMutationPatch } from '../../store/workspaceNodeMutationPatch';
import { reconcileReviewSession } from '../../store/workspaceReviewSessionSync';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceState } from '../../store/workspaceStoreTypes';

import type { SplitTopicFormState } from './SplitTopicDialogParts';

function buildGeneratedTopic(part: SplitTopicPreviewPart, source: WorkspaceState['nodesById'][string], form: SplitTopicFormState, timestamp: string) {
  return {
    id: `node-${crypto.randomUUID()}`,
    parentNodeId: form.disposition === 'keep-as-parent' ? source.id : source.parentNodeId,
    kind: 'topic' as const,
    title: part.title,
    isTitleManual: false,
    hideTitleHeading: false,
    hasContent: part.body.trim().length > 0,
    content: part.body,
    anchorLink: null,
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

type GeneratedTopic = ReturnType<typeof buildGeneratedTopic>;

function mergeGeneratedDocuments(nodesById: WorkspaceState['nodesById'], generatedNodes: GeneratedTopic[]) {
  const next = { ...nodesById };
  for (const generated of generatedNodes) {
    const runtimeNode = next[generated.id];
    if (runtimeNode) next[generated.id] = { ...runtimeNode, content: generated.content, hasContent: true, imageRegions: null, reveal: null, virtualFilter: null };
  }
  return next;
}

function applyResult(result: NonNullable<Awaited<ReturnType<typeof saveSplitTopicWorkspaceMutation>>>, generatedNodes: GeneratedTopic[], deletedAt: string) {
  useWorkspaceStore.setState((state) => {
    const runtimePatch = createWorkspaceNodeMutationPatch(state, result);
    const deletedIds = result.deletedNodeIds ?? [];
    const trashedNodeIds = [...new Set([...state.trashedNodeIds, ...deletedIds])];
    const trashedNodeDeletedAtById = { ...state.trashedNodeDeletedAtById };
    deletedIds.forEach((nodeId) => { trashedNodeDeletedAtById[nodeId] = deletedAt; });
    const nodesById = mergeGeneratedDocuments(runtimePatch.nodesById ?? state.nodesById, generatedNodes);
    const nextState = { ...state, ...runtimePatch, nodesById, trashedNodeDeletedAtById, trashedNodeIds };
    return {
      ...runtimePatch,
      nodesById,
      navigation: sanitizeNavigationState(state.navigation, nodesById, new Set(trashedNodeIds)),
      rendererBoundaryKeepNodeIds: generatedNodes.map((node) => node.id),
      reviewSession: reconcileReviewSession(nextState, runtimePatch.activeNodeId ?? state.activeNodeId),
      trashedNodeDeletedAtById,
      trashedNodeIds
    };
  });
}

export async function confirmSplitTopic(args: {
  form: SplitTopicFormState;
  preview: SplitTopicPreviewPart[];
  source: WorkspaceState['nodesById'][string];
  state: WorkspaceState;
}) {
  const timestamp = new Date().toISOString();
  const generatedNodes = args.preview.map((part) => buildGeneratedTopic(part, args.source, args.form, timestamp));
  const nodeOrder = buildSplitTopicNodeOrder({ generatedNodeIds: generatedNodes.map((node) => node.id), nodeOrder: args.state.nodeOrder, sourceNodeId: args.source.id });
  const mutationBase = {
    activeNodeId: generatedNodes[0]!.id,
    generatedNodes,
    nodeOrder,
    sourceNodeId: args.source.id,
    sourceParentNodeId: args.source.parentNodeId
  };
  const result = args.form.disposition === 'replace'
    ? await saveSplitTopicWorkspaceMutation({ ...mutationBase, deletedAt: timestamp, disposition: 'replace' })
    : await saveSplitTopicWorkspaceMutation({ ...mutationBase, disposition: 'keep-as-parent' });
  if (!result) throw new Error('Split Topic failed.');
  applyResult(result, generatedNodes, timestamp);
  try {
    await saveSplitTopicPreferences({
      delimiter: args.form.delimiter,
      disposition: args.form.disposition,
      keepDelimiter: args.form.keepDelimiter
    });
    return true;
  } catch {
    return false;
  }
}
