import type { MouseEvent as ReactMouseEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { EditorViewportMode } from '../../features/editor/adapters/EditorAdapter';
import type { ClipboardAnchorRange } from '../../features/editor/model/anchorClipboardPayload';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type {
  RuntimeExternalSearchBrowseEntry,
  RuntimeExternalSearchFolder
} from '../../shared/platform/externalSearchBridge';
import type { NodeViewState } from '../../store/workspaceStore';
import type { SelectionCommandPayload } from '../contextCommands';
import type { LongClozeGuardOptions } from '../hooks/editorClozeGuardrail';

import type { ExternalLibrarySelection } from './externalLibraryBrowseModel';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

export interface WorkspaceDocumentSurfaceSource {
  beginApplyingReadingPosition: (selection: EditorSelection, reason: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  completeApplyingReadingPosition: (reason: string, selection?: EditorSelection) => void;
  contextMenu: WorkspaceEditorContextMenu | null;
  editorContent: string;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  externalEntriesByFolderId: Record<string, RuntimeExternalSearchBrowseEntry[] | undefined>;
  externalFolders: RuntimeExternalSearchFolder[];
  externalSelection: ExternalLibrarySelection;
  getReadingPositionSelection: () => EditorSelection | null;
  getReadingPositionTargetViewportMode: () => EditorViewportMode | null;
  getReadingPositionTargetViewportRatio: () => number | null;
  isEditorReadOnly: boolean;
  isExternalViewOpen: boolean;
  isImmersiveMode: boolean;
  isPriorityQuickSetActive: boolean;
  isTrashViewOpen: boolean;
  isWorkspaceHydrated?: boolean;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onAnswerChange: (answer: string) => void;
  onCloseContextMenu: () => void;
  onCopyImage: () => void;
  onCreateCloze: (options?: LongClozeGuardOptions) => void;
  onCreateClozeFromPayload?: (payload: SelectionCommandPayload, options?: LongClozeGuardOptions) => string | null;
  onCreateHighlight: () => void;
  onCreateHighlightFromPayload?: (payload: SelectionCommandPayload) => string | null;
  onCreateNote: (note: string) => void;
  onDeleteExistingHighlight: () => void;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onEditorChange: (content: string) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onExportImage: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onNodePriorityChange: (nodeId: string, priority: number | null) => void;
  onOpenExternalSelection: (selection: ExternalLibrarySelection) => void;
  onPastedTextAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onRegisterEditorDraftFlush: (flush: (() => boolean) | null, closeFlush: (() => Promise<boolean>) | null) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
  onRevealDocumentPosition: (position: number) => void;
  onRevealDocumentSelection: (selection: EditorSelection, targetViewportMode?: EditorViewportMode) => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  onSelectNodeInVirtualView: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  priorityQuickSetShortcutLabel: string;
  reviewSchedulerSettings: ReviewSchedulerSettings;
  setReadingPositionSelection: (selection: EditorSelection) => void;
  showAnswerSection: boolean;
  trashedNodeIds: string[];
}

export type WorkspaceDocumentSurfaceProps = WorkspaceDocumentSurfaceSource & {
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  showDocumentOutline?: boolean;
};

type WorkspaceDocumentSurfaceSelectorArgs = {
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  props: WorkspaceDocumentSurfaceSource;
};

function selectDocumentSurfaceState({
  documentNodeId,
  isImmersiveEditing,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  props
}: WorkspaceDocumentSurfaceSelectorArgs) {
  return {
    documentNodeId,
    isEditorReadOnly: props.isEditorReadOnly,
    isExternalViewOpen: props.isExternalViewOpen,
    isImmersiveEditing,
    isImmersiveMode: props.isImmersiveMode,
    isPriorityQuickSetActive: props.isPriorityQuickSetActive,
    isTrashViewOpen: props.isTrashViewOpen,
    isWorkspaceHydrated: props.isWorkspaceHydrated,
    onEnterImmersiveEdit,
    onShouldSuppressSelectionRestore,
    showAnswerSection: props.showAnswerSection
  };
}

function selectDocumentSurfaceData(props: WorkspaceDocumentSurfaceSource) {
  return {
    contextMenu: props.contextMenu,
    editorContent: props.editorContent,
    editorNodeId: props.editorNodeId,
    editorNodeViewState: props.editorNodeViewState,
    externalEntriesByFolderId: props.externalEntriesByFolderId,
    externalFolders: props.externalFolders,
    externalSelection: props.externalSelection,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    priorityQuickSetShortcutLabel: props.priorityQuickSetShortcutLabel,
    reviewSchedulerSettings: props.reviewSchedulerSettings,
    trashedNodeIds: props.trashedNodeIds
  };
}

function selectDocumentSurfaceNavigation(props: WorkspaceDocumentSurfaceSource) {
  return {
    canGoBack: props.canGoBack,
    canGoForward: props.canGoForward,
    canGoParent: props.canGoParent,
    onGoBack: props.onGoBack,
    onGoForward: props.onGoForward,
    onGoParent: props.onGoParent,
    onOpenExternalSelection: props.onOpenExternalSelection,
    onSelectBreadcrumbNode: props.onSelectBreadcrumbNode,
    onSelectNode: props.onSelectNode,
    onSelectNodeInVirtualView: props.onSelectNodeInVirtualView
  };
}

function selectDocumentSurfaceEditorActions(props: WorkspaceDocumentSurfaceSource) {
  return {
    onAnswerChange: props.onAnswerChange,
    onCloseContextMenu: props.onCloseContextMenu,
    onCopyImage: props.onCopyImage,
    onCreateCloze: props.onCreateCloze,
    onCreateClozeFromPayload: props.onCreateClozeFromPayload,
    onCreateHighlight: props.onCreateHighlight,
    onCreateHighlightFromPayload: props.onCreateHighlightFromPayload,
    onCreateNote: props.onCreateNote,
    onDeleteExistingHighlight: props.onDeleteExistingHighlight,
    onCreatePdfHighlight: props.onCreatePdfHighlight,
    onCutImage: props.onCutImage,
    onDeleteImage: props.onDeleteImage,
    onEditorChange: props.onEditorChange,
    onEditorContextMenu: props.onEditorContextMenu,
    onEditorReady: props.onEditorReady,
    onExportImage: props.onExportImage,
    onNodeContentChange: props.onNodeContentChange,
    onNodePriorityChange: props.onNodePriorityChange,
    onPastedTextAnchors: props.onPastedTextAnchors,
    onPersistPdfViewState: props.onPersistPdfViewState,
    onRegisterEditorDraftFlush: props.onRegisterEditorDraftFlush,
    onResolveDocumentPositionAtViewportY: props.onResolveDocumentPositionAtViewportY,
    onRevealDocumentPosition: props.onRevealDocumentPosition,
    onRevealDocumentSelection: props.onRevealDocumentSelection,
  };
}

function selectDocumentSurfaceReadingPosition(props: WorkspaceDocumentSurfaceSource) {
  return {
    beginApplyingReadingPosition: props.beginApplyingReadingPosition,
    completeApplyingReadingPosition: props.completeApplyingReadingPosition,
    getReadingPositionSelection: props.getReadingPositionSelection,
    getReadingPositionTargetViewportMode: props.getReadingPositionTargetViewportMode,
    getReadingPositionTargetViewportRatio: props.getReadingPositionTargetViewportRatio,
    setReadingPositionSelection: props.setReadingPositionSelection
  };
}

export function selectWorkspaceDocumentSurfaceProps({
  documentNodeId,
  isImmersiveEditing,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  props
}: WorkspaceDocumentSurfaceSelectorArgs): WorkspaceDocumentSurfaceProps {
  return {
    ...selectDocumentSurfaceState({
      documentNodeId,
      isImmersiveEditing,
      onEnterImmersiveEdit,
      onShouldSuppressSelectionRestore,
      props
    }),
    ...selectDocumentSurfaceData(props),
    ...selectDocumentSurfaceNavigation(props),
    ...selectDocumentSurfaceEditorActions(props),
    ...selectDocumentSurfaceReadingPosition(props)
  };
}
