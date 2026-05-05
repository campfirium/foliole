import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import type { ReviewGrade, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';
import type { NodeViewState } from '../../store/workspaceStore';
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
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  contextMenu: WorkspaceEditorContextMenu | null;
  documentMaxWidth: number;
  editorContent: string;
  isEditorReadOnly: boolean;
  onNodePriorityChange: (nodeId: string, priority: number | null) => void;
  onNodeDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => void;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
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
  imageClozeComposerAttachmentId: string | null;
  listWidth: number;
  rightSidebarWidth: number;
  nodeOrder: string[];
  trashedNodeIds: string[];
  nodesById: Record<string, Node>;
  onAnswerChange: (answer: string) => void;
  onEditorChange: (content: string) => void;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResetLayout: () => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onRevealAnchorInDocument: (anchor: NodeAnchorLink) => void;
  onPersistPdfViewState: (nodeId: string, viewState: NodeViewState) => void;
  onRevealDocumentPosition: (position: number) => void;
  onRevealDocumentSelection: (selection: EditorSelection) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
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
  onCloseImportManagement: () => void;
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
  onCreateImageCloze: () => void;
  onCreatePdfHighlight: (selectionText: string, locator: NodeAnchorLink['locator']) => boolean;
  onCreateCloze: () => void;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
  onCloseImageClozeComposer: () => void;
  onSaveImageCloze: (regions: import('../../features/image-cloze/model/imageCloze').ImageClozeDraftRegion[]) => string[];
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
