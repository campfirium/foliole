import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { ClipboardAnchorRange } from '../../features/editor/model/anchorClipboardPayload';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { ReviewGrade, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';
import type { NodeViewState } from '../../store/workspaceStore';
import type { SelectionCommandPayload } from '../contextCommands';
import type { ReadingPositionSyncState } from '../hooks/useAppRuntime';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import type { ReviewQueueVisibility } from './reviewQueueVisibility';
import { WorkspaceLayoutMain } from './WorkspaceLayoutMain';

export interface WorkspaceEditorContextMenu {
  canRunCommands?: boolean;
  imageAttachmentId?: string;
  imageRange?: {
    from: number;
    to: number;
  };
  kind: 'image' | 'selection';
  left: number;
  top: number;
}

export interface WorkspaceLayoutProps {
  activeNodeId: string | null;
  isWorkspaceHydrated?: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  contextMenu: WorkspaceEditorContextMenu | null;
  documentMaxWidth: number;
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
  editorContent: string;
  isImmersiveMode: boolean;
  isEditorReadOnly: boolean;
  isPriorityQuickSetActive: boolean;
  onNodePriorityChange: (nodeId: string, priority: number | null) => void;
  onNodeDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => void;
  onEnterPriorityQuickSet: () => void;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  priorityQuickSetShortcutLabel: string;
  canStartStudyMode: boolean;
  reviewDueCount: number;
  reviewPreview: SchedulerPreviewResult | null;
  isStudyMode: boolean;
  isImportManagementOpen: boolean;
  isSettingsOpen: boolean;
  requestedSettingsCategory: SettingsCategoryId | null;
  requestedSettingsDialog: 'readwise-reader' | null;
  isAnswerRevealed: boolean;
  isCurrentReviewItemGradable: boolean;
  isReviewEditing: boolean;
  reviewCurrentNodeId: string | null;
  reviewPanelQueueNodeIds: string[];
  reviewQueueNodeIds: string[];
  reviewQueueVisibility: ReviewQueueVisibility | null;
  reviewQueueCount: number;
  reviewCompletedCount: number;
  reviewStatus: 'awaiting-answer' | 'answer-revealed' | 'completed';
  isDocumentResizing: boolean;
  isResizingList: boolean;
  isResizingRightSidebar: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  isViewingTrashNode: boolean;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  showAnswerSection: boolean;
  listWidth: number;
  rightSidebarWidth: number;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
  onAnswerChange: (answer: string) => void;
  onEditorChange: (content: string) => void;
  onRegisterEditorDraftFlush: (flush: (() => boolean) | null, closeFlush: (() => Promise<boolean>) | null) => void;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResetLayout: () => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
  shouldSuppressNavigationSelectionRestore: () => boolean;
  onRevealAnchorInDocument: (anchor: NodeAnchorLink) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onRevealDocumentPosition: (position: number) => void;
  onRevealDocumentSelection: (selection: EditorSelection) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
  beginApplyingReadingPosition: (selection: EditorSelection, reason: string) => void;
  completeApplyingReadingPosition: (reason: string) => void;
  getReadingPositionSelection: () => EditorSelection | null;
  getReadingPositionSyncState: () => ReadingPositionSyncState | null;
  setReadingPositionSelection: (selection: EditorSelection) => void;
  onSelectTrashNode: (nodeId: string) => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onRightSidebarSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRightSidebarSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onOpenNotesView: () => void;
  onOpenMoveToNode: () => void;
  onOpenImportManagement: () => void;
  onOpenTrashView: () => void;
  onOpenVirtualView: () => void;
  onEnterImmersiveEdit: () => void;
  onEnterImmersiveMode: () => void;
  onExitImmersiveMode: () => void;
  onCloseImportManagement: () => void;
  onToggleImmersiveMode: () => void;
  onToggleListVisibility: () => void;
  onToggleRightSidebarVisibility: () => void;
  onRunImportFile: () => Promise<boolean>;
  onRunImportFolder: () => Promise<boolean>;
  onStartClipboardImport: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onCloseContextMenu: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreateSelectionHighlight: (payload: SelectionCommandPayload) => string | null;
  onPastedTextAnchors?: (payload: { anchors: ClipboardAnchorRange[]; content: string; nodeId: string }) => void;
  onToggleSelectionHighlight: (payload: SelectionCommandPayload) => 'created' | 'deleted' | null;
  onCreateSelectionNote: (payload: SelectionCommandPayload) => string | null;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onCreateCloze: () => void;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  onStartStudyMode: () => void;
  onToggleReviewSession: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onRevealAnswer: () => void;
  onGradeReview: (grade: ReviewGrade) => Promise<boolean>;
  onCompleteReviewItem: () => boolean;
  onDeferReviewItem: () => boolean;
  onDismissReviewItem: () => boolean;
  onExitReviewMode: () => void;
  reviewSchedulerSettings: ReviewSchedulerSettings;
  selectedTrashNodeId: string | null;
}

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  return <WorkspaceLayoutMain {...props} />;
}
