import { useMemo, useRef, type ReactNode } from 'react';

import {
  projectWorkspaceListNodesById,
  type WorkspaceListNodesById
} from '../../features/nodes/model/workspaceListNode';
import { recordComponentRender } from '../../shared/platform/performanceDiagnosticsProbe';

import { WorkspaceBottomReviewToolbar } from './WorkspaceBottomReviewToolbar';
import { getWorkspaceGridColumns } from './workspaceGridColumns';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';
import { renderWorkspaceGridColumns } from './workspaceLayoutGridContentColumns';
import { WorkspaceLeftRail } from './WorkspaceLeftRail';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export function WorkspaceLayoutGrid({
  activeRightPanelId,
  documentNodeId,
  isImportManagementOpen,
  onEnterImmersiveEdit,
  onOpenImportManagement,
  onShouldSuppressSelectionRestore,
  onStartClipboardImport,
  onStartImport,
  onSelectNode,
  isImmersiveEditing,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImportManagementOpen: boolean;
  onEnterImmersiveEdit: () => void;
  onOpenImportManagement: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onStartClipboardImport: () => void;
  onStartImport: () => void;
  onSelectNode: WorkspaceLayoutProps['onSelectNode'];
  isImmersiveEditing: boolean;
  props: WorkspaceLayoutProps;
}) {
  recordComponentRender('workspaceGrid');
  const listNodesById = useProjectedListNodesById(props.nodesById);
  return (
    <div
      className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden max-[1080px]:[grid-template-columns:minmax(0,1fr)]"
      style={{
        gridTemplateColumns: props.isImmersiveMode
          ? 'minmax(0, 1fr)'
          : 'var(--workspace-rail-width) minmax(0, 1fr)'
      }}
    >
      {props.isImmersiveMode ? null : (
        <WorkspaceLeftRail
          isImportManagementOpen={isImportManagementOpen}
          onOpenImportManagement={onOpenImportManagement}
          onStartClipboardImport={onStartClipboardImport}
          onStartImport={onStartImport}
          showStudyDock={!props.isStudyMode}
          props={props}
        />
      )}
      <WorkspaceGridContent
        activeRightPanelId={activeRightPanelId}
        documentNodeId={documentNodeId}
        isImmersiveEditing={isImmersiveEditing}
        listNodesById={listNodesById}
        onEnterImmersiveEdit={onEnterImmersiveEdit}
        onShouldSuppressSelectionRestore={onShouldSuppressSelectionRestore}
        onSelectNode={onSelectNode}
        props={props}
      />
      <WorkspaceBottomReviewToolbar props={props} />
    </div>
  );
}

function useProjectedListNodesById(nodesById: WorkspaceLayoutProps['nodesById']) {
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
  isResizingRightSidebar,
  props
}: {
  children: ReactNode;
  isImmersiveMode: boolean;
  isResizingList: boolean;
  isResizingRightSidebar: boolean;
  props: WorkspaceLayoutProps;
}) {
  return (
    <div className={`${isImmersiveMode ? 'col-start-1' : 'col-start-2'} min-h-0 min-w-0 overflow-hidden max-[1080px]:col-start-1`}>
      <div
        className={`grid h-full min-h-0 gap-0 overflow-hidden ${getWorkspaceGridColumns(props)} max-[1080px]:grid-cols-1 max-[1080px]:grid-rows-[minmax(0,38dvh)_minmax(0,1fr)]`}
        data-resizing={isResizingList || isResizingRightSidebar}
      >
        {children}
      </div>
    </div>
  );
}

function WorkspaceGridContent({
  activeRightPanelId,
  documentNodeId,
  isImmersiveEditing,
  listNodesById,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  onSelectNode,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  listNodesById: WorkspaceListNodesById;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onSelectNode: WorkspaceLayoutProps['onSelectNode'];
  props: WorkspaceLayoutProps;
}) {
  return (
    <WorkspaceLayoutGridFrame
      isImmersiveMode={props.isImmersiveMode}
      isResizingList={props.isResizingList}
      isResizingRightSidebar={props.isResizingRightSidebar}
      props={props}
    >
      {renderWorkspaceGridColumns({
        activeRightPanelId,
        documentNodeId,
        isImmersiveEditing,
        listNodesById,
        onEnterImmersiveEdit,
        onShouldSuppressSelectionRestore,
        onSelectNode,
        props
      })}
    </WorkspaceLayoutGridFrame>
  );
}
