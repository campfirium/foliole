import { memo } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryFolder
} from '../../shared/platform/externalLibraryBrowseRepository';
import type { WorkspaceManualVirtualCollection } from '../../store/workspaceStore';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import { StudySessionCompleteSummary } from './StudySessionCompleteSummary';
import type { StudySessionCompleteSummaryProps } from './StudySessionCompleteSummary';
import { WorkspaceDocumentSurface } from './WorkspaceDocumentSurface';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';
import { WorkspaceDualListContent } from './WorkspaceDualListContent';
import type { WorkspaceDualListContentProps } from './WorkspaceDualListContent';
import { areWorkspaceListAreaPropsEqual } from './workspaceListAreaMemo';
import { WorkspaceListEmptyState, WorkspaceListLoadingState } from './WorkspaceListStates';

export interface WorkspaceListAreaProps {
  activeNodeId: string | null;
  activeVirtualNodeId: string | null;
  isStudyMode: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  isExternalViewOpen: boolean;
  isWorkspaceHydrated?: boolean;
  listNodesById: WorkspaceListNodesById;
  manualVirtualCollections?: readonly WorkspaceManualVirtualCollection[];
  nodesById: Record<string, Node>;
  nodeOrder: string[];
  onCreateChildNode?: WorkspaceDualListContentProps['onCreateChildNode'] | undefined;
  onOpenMoveToNode: () => void;
  onOpenPostponeTopicPanel?: (nodeId?: string | null) => boolean;
  onOpenNotesView: () => void;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onOpenExternalLibrarySettings: () => void;
  onChangeExternalFolder?: (folderId: string) => void;
  onRemoveExternalFolder?: (folderId: string) => void;
  onRescanExternalFolder?: (folderId: string) => void;
  onOpenTrashView: () => void;
  onOpenVirtualView: (nodeId?: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  reviewCurrentNodeId: string | null;
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
  externalEntriesByFolderId: Record<string, ExternalLibraryBrowseEntry[] | undefined>;
  externalFolders: ExternalLibraryFolder[];
  externalSelection: ExternalLibrarySelection;
}

function shouldShowWorkspaceEmptyState(args: {
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  isExternalViewOpen: boolean;
  isWorkspaceHydrated?: boolean;
  nodeOrder: string[];
  trashedNodeIds: string[];
}) {
  const hasVisibleWorkspaceNodes = args.nodeOrder.some(
    (nodeId) =>
      nodeId !== INBOX_NODE_ID &&
      nodeId !== VIRTUAL_ROOT_NODE_ID &&
      !args.trashedNodeIds.includes(nodeId)
  );

  return (
    Boolean(
      args.isWorkspaceHydrated &&
      !args.isTrashViewOpen &&
      !args.isVirtualViewOpen &&
      !args.isExternalViewOpen &&
      !hasVisibleWorkspaceNodes
    )
  );
}

export const WorkspaceListArea = memo(function WorkspaceListArea(props: WorkspaceListAreaProps) {
  const shouldShowEmptyState = shouldShowWorkspaceEmptyState({
    isTrashViewOpen: props.isTrashViewOpen,
    isVirtualViewOpen: props.isVirtualViewOpen,
    isExternalViewOpen: props.isExternalViewOpen,
    nodeOrder: props.nodeOrder,
    trashedNodeIds: props.trashedNodeIds,
    ...definedProps({ isWorkspaceHydrated: props.isWorkspaceHydrated })
  });

  return (
    <div className="workspace-region-main-folder flex min-h-0 flex-1 flex-col overflow-hidden text-foreground">
      {renderWorkspaceListBody({
        ...props,
        shouldShowEmptyState,
        ...definedProps({ isWorkspaceHydrated: props.isWorkspaceHydrated })
      })}
    </div>
  );
}, areWorkspaceListAreaPropsEqual);

function renderWorkspaceListBody(
  props: Pick<
    WorkspaceListAreaProps,
    | 'activeNodeId'
    | 'activeVirtualNodeId'
    | 'externalEntriesByFolderId'
    | 'externalFolders'
    | 'externalSelection'
    | 'isExternalViewOpen'
    | 'isStudyMode'
    | 'isTrashViewOpen'
    | 'isVirtualViewOpen'
    | 'isWorkspaceHydrated'
    | 'listNodesById'
    | 'manualVirtualCollections'
    | 'nodesById'
    | 'nodeOrder'
    | 'onCreateChildNode'
    | 'onOpenMoveToNode'
    | 'onOpenPostponeTopicPanel'
    | 'onOpenNotesView'
    | 'onOpenExternalSelection'
    | 'onOpenExternalLibrarySettings'
    | 'onChangeExternalFolder'
    | 'onRemoveExternalFolder'
    | 'onRescanExternalFolder'
    | 'onOpenTrashView'
    | 'onOpenVirtualView'
    | 'onSelectNode'
    | 'onSelectNodeInVirtualView'
    | 'onSelectTrashNode'
    | 'reviewCurrentNodeId'
    | 'selectedTrashNodeId'
    | 'trashedNodeIds'
  > & { shouldShowEmptyState: boolean }
) {
  if (!props.isWorkspaceHydrated) {
    return <WorkspaceListLoadingState />;
  }
  if (props.shouldShowEmptyState) {
    return <WorkspaceListEmptyState />;
  }
  return renderWorkspaceDualListBody(props);
}

function renderWorkspaceDualListBody(
  props: WorkspaceDualListContentProps & { isWorkspaceHydrated?: boolean; shouldShowEmptyState: boolean }
) {
  const dualListProps: WorkspaceDualListContentProps = props;
  return <WorkspaceDualListContent {...dualListProps} />;
}

export const WorkspaceDocumentArea = memo(function WorkspaceDocumentArea({
  documentSurfaceProps,
  studySessionCompleteSummaryProps
}: {
  documentSurfaceProps: WorkspaceDocumentSurfaceProps;
  studySessionCompleteSummaryProps: StudySessionCompleteSummaryProps | null;
}) {
  const t = useTranslation();
  return (
    <section aria-label={t('desktop.workspace.documentAndReviewArea')} className="flex min-h-0 min-w-0 flex-1 flex-col gap-0">
      {studySessionCompleteSummaryProps ? (
        <StudySessionCompleteSummary {...studySessionCompleteSummaryProps} />
      ) : (
        <WorkspaceDocumentSurface {...documentSurfaceProps} />
      )}
    </section>
  );
});
