import type { ImmersiveReadingModeSource } from './immersiveReadingModeTypes';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

export function selectImmersiveReadingModeSource(props: WorkspaceLayoutProps): ImmersiveReadingModeSource {
  return {
    activeNodeId: props.navigation.activeNodeId,
    beginApplyingReadingPosition: props.readingPosition.beginApplyingReadingPosition,
    completeApplyingReadingPosition: props.readingPosition.completeApplyingReadingPosition,
    editorAdapterRef: props.document.editorAdapterRef,
    editorNodeViewState: props.document.editorNodeViewState,
    getReadingPositionSelection: props.readingPosition.getReadingPositionSelection,
    getReadingPositionSyncState: props.readingPosition.getReadingPositionSyncState,
    isImmersiveMode: props.layoutChrome.isImmersiveMode,
    isStudyMode: props.review.isStudyMode,
    nodeOrder: props.nodeList.nodeOrder,
    nodesById: props.nodeList.nodesById,
    onCreateSelectionNote: props.editorCommands.onCreateSelectionNote,
    onExitImmersiveMode: props.layoutChrome.onExitImmersiveMode,
    onSelectNode: props.navigation.onSelectNode,
    onToggleImmersiveMode: props.layoutChrome.onToggleImmersiveMode,
    onToggleSelectionHighlight: props.editorCommands.onToggleSelectionHighlight,
    setReadingPositionSelection: props.readingPosition.setReadingPositionSelection,
    trashedNodeIds: props.trash.trashedNodeIds
  };
}
