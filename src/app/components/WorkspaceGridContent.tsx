import { useMemo, useRef, type ReactNode } from 'react';

import {
  projectWorkspaceListNodesById,
  type WorkspaceListNodesById
} from '../../features/nodes/model/workspaceListNode';

import {
  selectWorkspaceDocumentSurfaceProps,
  type WorkspaceDocumentSurfaceSource
} from './workspaceDocumentSurfaceProps';
import { getWorkspaceGridColumns } from './workspaceGridColumns';
import { selectWorkspaceGridColumnProps } from './workspaceGridContentProps';
import type { WorkspaceGridContentProjectionSource } from './workspaceGridContentProps';
import { renderWorkspaceGridColumns } from './workspaceLayoutGridContentColumns';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export type WorkspaceGridContentSource = WorkspaceDocumentSurfaceSource & WorkspaceGridContentProjectionSource;

export function WorkspaceGridContent({
  activeRightPanelId,
  documentNodeId,
  isImmersiveEditing,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onSelectNode: WorkspaceGridContentProjectionSource['onSelectNode'];
  props: WorkspaceGridContentSource;
}) {
  const listNodesById = useProjectedListNodesById(props.nodesById);
  const documentSurfaceProps = useMemo(
    () => ({
      ...selectWorkspaceDocumentSurfaceProps({
        documentNodeId,
        isImmersiveEditing,
        onEnterImmersiveEdit,
        onShouldSuppressSelectionRestore,
        props
      }),
      showDocumentOutline: activeRightPanelId !== 'outline' || props.isRightSidebarCollapsed
    }),
    [
      activeRightPanelId,
      documentNodeId,
      isImmersiveEditing,
      onEnterImmersiveEdit,
      onShouldSuppressSelectionRestore,
      props
    ]
  );
  const outlineActivePosition = resolveOutlineActivePosition({
    editorSelection: props.editorNodeViewState?.selection ?? null,
    readingSelection: props.getReadingPositionSelection()
  });

  return (
    <WorkspaceLayoutGridFrame
      isImmersiveMode={props.isImmersiveMode}
      isResizingList={props.isResizingList}
      isResizingRightSidebar={props.isResizingRightSidebar}
    >
      {renderWorkspaceGridColumns(
        selectWorkspaceGridColumnProps({
          activeRightPanelId,
          documentNodeId,
          documentSurfaceProps,
          listNodesById,
          outlineActivePosition,
          onSelectNode,
          props
        })
      )}
    </WorkspaceLayoutGridFrame>
  );
}

export function resolveOutlineActivePosition(args: {
  editorSelection?: { from: number } | null;
  readingSelection?: { from: number } | null;
}) {
  return args.readingSelection?.from ?? args.editorSelection?.from ?? 0;
}

function useProjectedListNodesById(nodesById: WorkspaceGridContentProjectionSource['nodesById']) {
  const previousListNodesByIdRef = useRef<WorkspaceListNodesById>({});
  return useMemo(() => {
    const nextProjection = projectWorkspaceListNodesById(
      nodesById,
      previousListNodesByIdRef.current
    );
    previousListNodesByIdRef.current = nextProjection;
    return nextProjection;
  }, [nodesById]);
}

function WorkspaceLayoutGridFrame({
  children,
  isImmersiveMode,
  isResizingList,
  isResizingRightSidebar
}: {
  children: ReactNode;
  isImmersiveMode: boolean;
  isResizingList: boolean;
  isResizingRightSidebar: boolean;
}) {
  return (
    <div className={`${isImmersiveMode ? 'col-start-1' : 'col-start-2'} min-h-0 min-w-0 overflow-hidden max-[1080px]:col-start-1`}>
      <div
        className={`grid h-full min-h-0 gap-0 overflow-hidden ${getWorkspaceGridColumns({ isImmersiveMode })} max-[1080px]:grid-cols-1 max-[1080px]:grid-rows-[minmax(0,38dvh)_minmax(0,1fr)]`}
        data-resizing={isResizingList || isResizingRightSidebar}
      >
        {children}
      </div>
    </div>
  );
}
