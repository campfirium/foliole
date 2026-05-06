import { useMemo, useRef, type ReactNode } from 'react';

import {
  projectWorkspaceListNodesById,
  type WorkspaceListNodesById
} from '../../features/nodes/model/workspaceListNode';

import {
  selectWorkspaceDocumentSurfaceProps
} from './workspaceDocumentSurfaceProps';
import { getWorkspaceGridColumns } from './workspaceGridColumns';
import { selectWorkspaceGridColumnProps } from './workspaceGridContentProps';
import { renderWorkspaceGridColumns } from './workspaceLayoutGridContentColumns';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export type WorkspaceGridContentSource = WorkspaceLayoutProps;

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
  onSelectNode: WorkspaceLayoutProps['navigation']['onSelectNode'];
  props: WorkspaceGridContentSource;
}) {
  const listNodesById = useProjectedListNodesById(props.nodeList.nodesById);
  const documentSurfaceProps = useWorkspaceGridDocumentSurfaceProps({
    activeRightPanelId,
    documentNodeId,
    isImmersiveEditing,
    onEnterImmersiveEdit,
    onShouldSuppressSelectionRestore,
    props
  });
  const outlineActivePosition = resolveOutlineActivePosition({
    editorSelection: props.document.editorNodeViewState?.selection ?? null,
    readingSelection: props.readingPosition.getReadingPositionSelection()
  });

  return (
    <WorkspaceLayoutGridFrame
      isImmersiveMode={props.layoutChrome.isImmersiveMode}
      isResizingList={props.layoutChrome.isResizingList}
      isResizingRightSidebar={props.layoutChrome.isResizingRightSidebar}
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

function useWorkspaceGridDocumentSurfaceProps({
  activeRightPanelId,
  documentNodeId,
  isImmersiveEditing,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  props: WorkspaceGridContentSource;
}) {
  const showDocumentOutline = activeRightPanelId !== 'outline' || props.layoutChrome.isRightSidebarCollapsed;
  return useMemo(
    () => ({
      ...selectWorkspaceDocumentSurfaceProps({
        documentNodeId,
        isImmersiveEditing,
        onEnterImmersiveEdit,
        onShouldSuppressSelectionRestore,
        props
      }),
      showDocumentOutline
    }),
    [
      documentNodeId,
      isImmersiveEditing,
      onEnterImmersiveEdit,
      onShouldSuppressSelectionRestore,
      props,
      showDocumentOutline
    ]
  );
}

export function resolveOutlineActivePosition(args: {
  editorSelection?: { from: number } | null;
  readingSelection?: { from: number } | null;
}) {
  return args.readingSelection?.from ?? args.editorSelection?.from ?? 0;
}

function useProjectedListNodesById(nodesById: WorkspaceLayoutProps['nodeList']['nodesById']) {
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
