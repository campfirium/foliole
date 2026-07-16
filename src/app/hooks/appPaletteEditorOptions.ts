import type { useWorkspaceSelectors } from './appControllerState';

interface EditorPaletteSource {
  activeNodeId: string | null;
  isViewingTrashNode: boolean;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodesById' | 'trashedNodeIds'>;
}

function hasCurrentTopic(args: EditorPaletteSource) {
  if (!args.activeNodeId || args.isViewingTrashNode || args.ws.trashedNodeIds.includes(args.activeNodeId)) return false;
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
  if (!args.activeNodeId || args.isViewingTrashNode || args.ws.trashedNodeIds.includes(args.activeNodeId)) return false;
  return args.ws.nodesById[args.activeNodeId]?.kind !== 'folder';
}

function canToggleImmersiveMode(args: EditorPaletteSource) {
  if (!args.activeNodeId || args.ws.trashedNodeIds.includes(args.activeNodeId)) return false;
  const activeNode = args.ws.nodesById[args.activeNodeId];
  return Boolean(activeNode && activeNode.kind !== 'folder');
}

export function buildEditorPaletteOptions(args: EditorPaletteSource) {
  const canUseCurrentTopic = hasCurrentTopic(args);
  return {
    canAnnotateSelection: canAnnotateSelection(args),
    canExportCurrentArticle: canExportCurrentArticle(args),
    canFindInCurrentTopic: canUseCurrentTopic,
    canMergeHighlightsIntoTopic: canUseCurrentTopic,
    canPublishToFoliole: canUseCurrentTopic,
    canPublishToDiscourse: canUseCurrentTopic,
    canPublishToWordPress: canUseCurrentTopic,
    canRepairTable: canAnnotateSelection(args),
    canSetNodePriority: Boolean(args.activeNodeId) && !args.isViewingTrashNode,
    canToggleImmersiveMode: canToggleImmersiveMode(args)
  };
}
