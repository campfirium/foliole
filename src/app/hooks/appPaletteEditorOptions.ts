import { canOpenDocumentComparisonView } from '../components/documentComparisonView';

import type { useWorkspaceSelectors } from './appControllerState';

interface EditorPaletteSource {
  activeNodeId: string | null;
  canScrollCurrentDocument?: boolean;
  isViewingTrashNode: boolean;
  isEditorReadOnly?: boolean;
  isExternalViewOpen?: boolean;
  isFoliolePublishedContext?: boolean;
  isImmersiveMode?: boolean;
  isReviewOnly?: boolean;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodesById' | 'trashedNodeIds'>;
}

function hasCurrentTopic(args: EditorPaletteSource) {
  if (
    !args.activeNodeId ||
    args.isViewingTrashNode ||
    args.ws.trashedNodeIds.includes(args.activeNodeId)
  )
    return false;
  const node = args.ws.nodesById[args.activeNodeId];
  return Boolean(node && node.kind === 'topic' && !node.anchorLink);
}

function canExportCurrentArticle(args: EditorPaletteSource) {
  if (!args.activeNodeId || args.ws.trashedNodeIds.includes(args.activeNodeId)) return false;
  const activeNode = args.ws.nodesById[args.activeNodeId];
  if (!activeNode || activeNode.kind === 'folder') return false;
  return activeNode.kind === 'topic' && !activeNode.anchorLink
    ? true
    : Boolean(activeNode.parentNodeId);
}

function canAnnotateSelection(args: EditorPaletteSource) {
  if (
    !args.activeNodeId ||
    args.isViewingTrashNode ||
    args.ws.trashedNodeIds.includes(args.activeNodeId)
  )
    return false;
  return args.ws.nodesById[args.activeNodeId]?.kind !== 'folder';
}

function canToggleImmersiveMode(args: EditorPaletteSource) {
  if (!args.activeNodeId || args.ws.trashedNodeIds.includes(args.activeNodeId)) return false;
  const activeNode = args.ws.nodesById[args.activeNodeId];
  return Boolean(activeNode && activeNode.kind !== 'folder');
}

export function buildEditorPaletteOptions(args: EditorPaletteSource) {
  const canUseCurrentTopic = hasCurrentTopic(args);
  const activeNode = args.activeNodeId ? args.ws.nodesById[args.activeNodeId] : undefined;
  return {
    canAnnotateSelection: canAnnotateSelection(args),
    canExportCurrentArticle: canExportCurrentArticle(args),
    canFindInCurrentTopic: canUseCurrentTopic,
    canOpenComparisonView: canOpenDocumentComparisonView({
      activeNode,
      activeNodeId: args.activeNodeId,
      editorNodeId: args.activeNodeId,
      isEditorReadOnly: args.isEditorReadOnly ?? false,
      isExternalViewOpen: args.isExternalViewOpen ?? false,
      isFoliolePublishedContext: args.isFoliolePublishedContext ?? false,
      isImmersiveMode: args.isImmersiveMode ?? false,
      isReviewOnly: args.isReviewOnly ?? false,
      isTrashViewOpen: args.isViewingTrashNode
    }),
    canMergeHighlightsIntoTopic: canUseCurrentTopic,
    canPublishToFoliole: canUseCurrentTopic,
    canPublishToDiscourse: canUseCurrentTopic,
    canPublishToWordPress: canUseCurrentTopic,
    canSplitCurrentTopic: canUseCurrentTopic && !args.isEditorReadOnly,
    canRepairTable: canAnnotateSelection(args),
    canScrollCurrentDocument:
      canUseCurrentTopic &&
      !args.isExternalViewOpen &&
      !args.isReviewOnly &&
      (args.canScrollCurrentDocument ?? true),
    canSetNodePriority: Boolean(args.activeNodeId) && !args.isViewingTrashNode,
    canToggleImmersiveMode: canToggleImmersiveMode(args)
  };
}
