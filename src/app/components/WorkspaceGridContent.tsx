import { useCallback, useMemo, useRef, type ReactNode } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import {
  projectWorkspaceListNodesById,
  type WorkspaceListNodesById
} from '../../features/nodes/model/workspaceListNode';

import { useExternalSearchPreviewDocument } from './externalSearchPreviewState';
import {
  selectWorkspaceTopicEditorFocusRoundTripInput,
  useWorkspaceTopicEditorFocusRoundTrip
} from './useWorkspaceTopicEditorFocusRoundTrip';
import { selectWorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';
import { getWorkspaceGridColumns } from './workspaceGridColumns';
import { useWorkspaceGridContentDiagnostic } from './workspaceGridContentDiagnostic';
import { resolveOutlineActivePosition, resolveShowDocumentOutline } from './workspaceGridContentModel';
import { selectWorkspaceGridColumnProps } from './workspaceGridContentProps';
import { measureWorkspaceDiagnostic } from './workspaceInputLagRenderDiagnostic';
import { renderWorkspaceGridColumns } from './workspaceLayoutGridContentColumns';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export type WorkspaceGridContentSource = WorkspaceLayoutProps;

interface WorkspaceGridContentProps {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  onSelectNode: WorkspaceLayoutProps['navigation']['onSelectNode'];
  props: WorkspaceGridContentSource;
}

export function WorkspaceGridContent({
  activeRightPanelId,
  documentNodeId,
  isImmersiveEditing,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  onSelectNode,
  props
}: WorkspaceGridContentProps) {
  const finishDiagnostic = useWorkspaceGridContentDiagnostic({ documentNodeId, props });
  const listNodesById = useProjectedListNodesById(props.nodeList.nodesById);
  const externalPreviewController = useExternalPreviewController(props);
  const focusRoundTrip = useWorkspaceTopicEditorFocusRoundTrip(selectWorkspaceTopicEditorFocusRoundTripInput(props, listNodesById));
  const documentSurfaceProps = useWorkspaceGridDocumentSurfaceProps({
    activeRightPanelId,
    documentNodeId,
    externalPreviewController,
    isImmersiveEditing,
    onEnterImmersiveEdit,
    onExitEditorFocus: focusRoundTrip.returnToTopic,
    onShouldSuppressSelectionRestore,
    props
  });
  const outlineActivePosition = resolveOutlineActivePosition({
    editorSelection: props.document.editorNodeViewState?.selection ?? null,
    readingSelection: props.readingPosition.getReadingPositionSelection()
  });
  finishDiagnostic({
    hasExternalOutline: Boolean(externalPreviewController.outlineDocument),
    listNodeCount: Object.keys(listNodesById).length
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
          externalOutlineDocument: externalPreviewController.outlineDocument,
          outlineActivePosition,
          onSelectNode,
          onFocusTopicEditor: focusRoundTrip.focusEditor,
          props
        })
      )}
    </WorkspaceLayoutGridFrame>
  );
}

function useWorkspaceGridDocumentSurfaceProps({
  activeRightPanelId,
  documentNodeId,
  externalPreviewController,
  isImmersiveEditing,
  onEnterImmersiveEdit,
  onExitEditorFocus,
  onShouldSuppressSelectionRestore,
  props
}: {
  activeRightPanelId: WorkspaceRightPanelId;
  documentNodeId: string | null;
  externalPreviewController: ReturnType<typeof useExternalPreviewController>;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onExitEditorFocus: () => boolean;
  onShouldSuppressSelectionRestore: () => boolean;
  props: WorkspaceGridContentSource;
}) {
  const showDocumentOutline = resolveShowDocumentOutline({
    activeRightPanelId,
    isImmersiveMode: props.layoutChrome.isImmersiveMode,
    isRightSidebarCollapsed: props.layoutChrome.isRightSidebarCollapsed
  });
  return useMemo(
    () => ({
      ...selectWorkspaceDocumentSurfaceProps({
        documentNodeId,
        isImmersiveEditing,
        onEnterImmersiveEdit,
        onShouldSuppressSelectionRestore,
        props
      }),
      externalPreviewState: externalPreviewController.previewState,
      onExternalPreviewEditorReady: externalPreviewController.onEditorReady,
      onExitEditorFocus,
      showDocumentOutline
    }),
    [
      documentNodeId,
      externalPreviewController,
      isImmersiveEditing,
      onEnterImmersiveEdit,
      onExitEditorFocus,
      onShouldSuppressSelectionRestore,
      props,
      showDocumentOutline
    ]
  );
}

function useExternalPreviewController(props: WorkspaceGridContentSource) {
  const editorRef = useRef<EditorAdapter | null>(null);
  const previewPath =
    props.externalLibrary.isExternalViewOpen && props.externalLibrary.externalSelection.kind === 'document'
      ? props.externalLibrary.externalSelection.absolutePath
      : null;
  const previewSourceKind =
    props.externalLibrary.isExternalViewOpen && props.externalLibrary.externalSelection.kind === 'document'
      ? props.externalLibrary.externalSelection.sourceKind
      : undefined;
  const previewFolderId =
    props.externalLibrary.isExternalViewOpen && props.externalLibrary.externalSelection.kind === 'document'
      ? props.externalLibrary.externalSelection.folderId
      : undefined;
  const previewState = useExternalSearchPreviewDocument(previewPath, {
    folderId: previewFolderId,
    sourceKind: previewSourceKind
  });
  const onEditorReady = useCallback((adapter: EditorAdapter | null) => {
    editorRef.current = adapter;
  }, []);
  const onRevealPosition = useCallback((position: number) => {
    editorRef.current?.revealPosition(position);
  }, []);
  const outlineDocument = useMemo(
    () =>
      props.externalLibrary.isExternalViewOpen
        ? {
            activePosition: 0,
            content: previewState.preview?.content ?? '',
            onRevealPosition
          }
        : undefined,
    [onRevealPosition, previewState.preview?.content, props.externalLibrary.isExternalViewOpen]
  );
  return useMemo(
    () => ({ onEditorReady, outlineDocument, previewState }),
    [onEditorReady, outlineDocument, previewState]
  );
}

function useProjectedListNodesById(nodesById: WorkspaceLayoutProps['nodeList']['nodesById']) {
  const previousListNodesByIdRef = useRef<WorkspaceListNodesById>({});
  return useMemo(() => {
    const previousProjection = previousListNodesByIdRef.current;
    const nextProjection = measureWorkspaceDiagnostic(
      'workspace-grid-list-projection',
      {
        nodeCount: Object.keys(nodesById).length,
        previousNodeCount: Object.keys(previousProjection).length
      },
      () => projectWorkspaceListNodesById(nodesById, previousProjection)
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
    <div className={`${isImmersiveMode ? 'col-start-1' : 'col-start-2'} min-h-0 min-w-0 overflow-hidden`}>
      <div
        className={`grid h-full min-h-0 gap-0 overflow-hidden ${getWorkspaceGridColumns({ isImmersiveMode })} max-[1080px]:grid-cols-1`}
        data-resizing={isResizingList || isResizingRightSidebar}
      >
        {children}
      </div>
    </div>
  );
}
