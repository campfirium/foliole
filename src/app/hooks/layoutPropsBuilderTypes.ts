import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewGrade, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';
import type { WorkspaceState } from '../../store/workspaceStore';
import type { WorkspaceLayoutFlatProps } from '../components/workspaceLayoutProps';

import type { StartStudyModeOptions } from './reviewModeSessionActions';

export interface BuildLayoutPropsArgs {
  activeNodeId: string | null;
  isWorkspaceHydrated: boolean;
  reviewSettings: {
    isReviewSchedulerSettingsReady: boolean;
    reviewSchedulerSettings: ReviewSchedulerSettings;
  };
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  canStartStudyMode: boolean;
  contextMenu: WorkspaceLayoutFlatProps['contextMenu'];
  documentNode?: { content: string };
  editorAdapterRef: { current: EditorAdapter | null };
  editorCtx: Pick<WorkspaceLayoutFlatProps,
    | 'onCloseContextMenu'
    | 'onCopyImage'
    | 'onCreateCloze'
    | 'onCreateClozeFromPayload'
    | 'onCreateHighlight'
    | 'onCreateHighlightFromPayload'
    | 'onCreateNote'
    | 'onOpenSelectionNote'
    | 'onDeleteExistingHighlight'
    | 'onOpenExistingHighlight'
    | 'onRepairTable'
    | 'onAdjustExistingHighlightRange'
    | 'onCreateSelectionHighlight'
    | 'onToggleSelectionHighlight'
    | 'onCreateSelectionNote'
    | 'onCreatePdfHighlight'
    | 'onCutImage'
    | 'onDeleteImage'
    | 'onEditorContextMenu'
    | 'onExportImage'
  >;
  editorNodeId: string | null;
  editorNodeViewState: WorkspaceLayoutFlatProps['editorNodeViewState'];
  isResizingList: boolean;
  isResizingRightSidebar: boolean;
  isImportManagementOpen: boolean;
  isImmersiveMode: boolean;
  isPriorityQuickSetActive: boolean;
  isSettingsOpen: boolean;
  requestedSettingsCategory: SettingsCategoryId | null;
  requestedSettingsDialog: 'readwise-reader' | null;
  isStudyMode: boolean;
  isReviewEditing: boolean;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  isExternalViewOpen: boolean;
  activeVirtualNodeId: string | null;
  isViewingTrashNode: boolean;
  listWidth: number;
  nowIso: string;
  rightSidebarWidth: number;
  nav: Pick<WorkspaceLayoutFlatProps,
    | 'onGoBack'
    | 'onGoForward'
    | 'onGoParent'
    | 'onSelectBreadcrumbNode'
    | 'onSelectNode'
    | 'onSelectNodeInVirtualView'
    | 'shouldSuppressNavigationSelectionRestore'
  >;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  externalFolders: WorkspaceLayoutFlatProps['externalFolders'];
  externalEntriesByFolderId: WorkspaceLayoutFlatProps['externalEntriesByFolderId'];
  externalSelection: WorkspaceLayoutFlatProps['externalSelection'];
  nodeViewById: WorkspaceLayoutFlatProps['nodeViewById'];
  onNodeDesiredRetentionChange: WorkspaceLayoutFlatProps['onNodeDesiredRetentionChange'];
  onNodePriorityChange: WorkspaceLayoutFlatProps['onNodePriorityChange'];
  onNodeShortTermChange: WorkspaceLayoutFlatProps['onNodeShortTermChange'];
  onAnswerChange: WorkspaceLayoutFlatProps['onAnswerChange'];
  onEditorChange: WorkspaceLayoutFlatProps['onEditorChange'];
  onEditorUndo: WorkspaceLayoutFlatProps['onEditorUndo'];
  onEditorRedo: WorkspaceLayoutFlatProps['onEditorRedo'];
  onFinalizeNodeTitle: WorkspaceLayoutFlatProps['onFinalizeNodeTitle'];
  onRegisterEditorDraftFlush: WorkspaceLayoutFlatProps['onRegisterEditorDraftFlush'];
  onPastedTextAnchors: WorkspaceLayoutFlatProps['onPastedTextAnchors'];
  onEnterPriorityQuickSet: WorkspaceLayoutFlatProps['onEnterPriorityQuickSet'];
  onOpenPostponeTopicPanel: WorkspaceLayoutFlatProps['onOpenPostponeTopicPanel'];
  onNodeContentChange: WorkspaceLayoutFlatProps['onNodeContentChange'];
  setNodeViewState: WorkspaceLayoutFlatProps['setNodeViewState'];
  onEditorReady: WorkspaceLayoutFlatProps['onEditorReady'];
  onOpenNotesView: () => void;
  onOpenMoveToNode: () => void;
  onOpenImportManagement: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onCloseImportManagement: () => void;
  onEnterImmersiveEdit: () => void;
  onEnterImmersiveMode: () => void;
  onExitImmersiveMode: () => void;
  onOpenTrashView: () => void;
  onOpenVirtualView: () => void;
  onOpenExternalSelection: WorkspaceLayoutFlatProps['onOpenExternalSelection'];
  onOpenExternalLibrarySettings: WorkspaceLayoutFlatProps['onOpenExternalLibrarySettings'];
  onOpenExternalView: WorkspaceLayoutFlatProps['onOpenExternalView'];
  onResetLayout: () => void;
  onSelectTrashNode: WorkspaceLayoutFlatProps['onSelectTrashNode'];
  onRevealAnchorInDocument: WorkspaceLayoutFlatProps['onRevealAnchorInDocument'];
  onPersistPdfViewState: WorkspaceLayoutFlatProps['onPersistPdfViewState'];
  onRevealDocumentPosition: WorkspaceLayoutFlatProps['onRevealDocumentPosition'];
  onRevealDocumentSelection: WorkspaceLayoutFlatProps['onRevealDocumentSelection'];
  onResolveDocumentPositionAtViewportY: WorkspaceLayoutFlatProps['onResolveDocumentPositionAtViewportY'];
  beginApplyingReadingPosition: WorkspaceLayoutFlatProps['beginApplyingReadingPosition'];
  completeApplyingReadingPosition: WorkspaceLayoutFlatProps['completeApplyingReadingPosition'];
  getReadingPositionRestoreCommand: WorkspaceLayoutFlatProps['getReadingPositionRestoreCommand'];
  getReadingPositionSelection: WorkspaceLayoutFlatProps['getReadingPositionSelection'];
  getReadingPositionSyncState: WorkspaceLayoutFlatProps['getReadingPositionSyncState'];
  getReadingPositionTargetViewportMode: WorkspaceLayoutFlatProps['getReadingPositionTargetViewportMode'];
  getReadingPositionTargetViewportRatio: WorkspaceLayoutFlatProps['getReadingPositionTargetViewportRatio'];
  setReadingPositionSelection: WorkspaceLayoutFlatProps['setReadingPositionSelection'];
  onRightSidebarSplitterKeyDown: WorkspaceLayoutFlatProps['onRightSidebarSplitterKeyDown'];
  onRightSidebarSplitterPointerDown: WorkspaceLayoutFlatProps['onRightSidebarSplitterPointerDown'];
  onSplitterKeyDown: WorkspaceLayoutFlatProps['onSplitterKeyDown'];
  onSplitterPointerDown: WorkspaceLayoutFlatProps['onSplitterPointerDown'];
  onToggleListVisibility: () => void;
  onToggleBothSidebarVisibility: () => void;
  onToggleImmersiveMode: () => void;
  onToggleRightSidebarVisibility: () => void;
  onRunImportFile: WorkspaceLayoutFlatProps['onRunImportFile'];
  onRunImportFolder: WorkspaceLayoutFlatProps['onRunImportFolder'];
  onStartClipboardImport: WorkspaceLayoutFlatProps['onStartClipboardImport'];
  priorityQuickSetShortcutLabel: string;
  reviewPreview: SchedulerPreviewResult | null;
  reviewSession: WorkspaceState['reviewSession'];
  reviewSessionMode: WorkspaceState['reviewSessionMode'];
  setReviewSessionMode: WorkspaceState['setReviewSessionMode'];
  onResumeReviewItem: () => void;
  selectedTrashNodeId: string | null;
  showAnswerSection: boolean;
  startStudyMode: (options?: StartStudyModeOptions) => void;
  startReviewSession: WorkspaceState['startReviewSession'];
  trashedNodeIds: string[];
  exitReviewSession: WorkspaceState['exitReviewSession'];
  exitStudyMode: () => void;
  updateGrade: (grade: ReviewGrade) => Promise<boolean>;
  readReviewTopic: () => Promise<boolean>;
  postponeReviewTopic: () => Promise<boolean>;
  dismissReviewTopic: () => Promise<boolean>;
  revisitReviewTopicSoon: () => Promise<boolean>;
  revealReviewAnswer: () => void;
}
