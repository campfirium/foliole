import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewGrade, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';
import type { WorkspaceState } from '../../store/workspaceStore';
import type {
  WorkspaceLayoutChromeProps,
  WorkspaceLayoutDocumentProps,
  WorkspaceLayoutEditorCommandProps,
  WorkspaceLayoutExternalLibraryProps,
  WorkspaceLayoutImportProps,
  WorkspaceLayoutNavigationProps,
  WorkspaceLayoutNodeListProps,
  WorkspaceLayoutReadingPositionProps,
  WorkspaceLayoutReviewProps,
  WorkspaceLayoutTrashProps
} from '../components/workspaceLayoutPropGroups';

import type { StartStudyModeOptions } from './reviewModeSessionActions';

export interface BuildLayoutPropsArgs {
  activeNodeId: string | null;
  browseRootNodeId: string;
  isWorkspaceHydrated: boolean;
  reviewSettings: {
    isReviewSchedulerSettingsReady: boolean;
    reviewSchedulerSettings: ReviewSchedulerSettings;
  };
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  canStartStudyMode: boolean;
  contextMenu: WorkspaceLayoutDocumentProps['contextMenu'];
  documentNode?: { content: string };
  editorAdapterRef: { current: EditorAdapter | null };
  editorCtx: Pick<WorkspaceLayoutEditorCommandProps & WorkspaceLayoutDocumentProps,
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
  editorNodeViewState: WorkspaceLayoutDocumentProps['editorNodeViewState'];
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
  nav: Pick<WorkspaceLayoutNavigationProps,
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
  externalFolders: WorkspaceLayoutExternalLibraryProps['externalFolders'];
  externalEntriesByFolderId: WorkspaceLayoutExternalLibraryProps['externalEntriesByFolderId'];
  externalSelection: WorkspaceLayoutExternalLibraryProps['externalSelection'];
  nodeViewById: WorkspaceLayoutDocumentProps['nodeViewById'];
  onNodeDesiredRetentionChange: WorkspaceLayoutDocumentProps['onNodeDesiredRetentionChange'];
  onNodePriorityChange: WorkspaceLayoutDocumentProps['onNodePriorityChange'];
  onNodeShortTermChange: WorkspaceLayoutDocumentProps['onNodeShortTermChange'];
  onAnswerChange: WorkspaceLayoutDocumentProps['onAnswerChange'];
  onEditorChange: WorkspaceLayoutDocumentProps['onEditorChange'];
  onEditorUndo: WorkspaceLayoutDocumentProps['onEditorUndo'];
  onEditorRedo: WorkspaceLayoutDocumentProps['onEditorRedo'];
  onFinalizeNodeTitle: WorkspaceLayoutDocumentProps['onFinalizeNodeTitle'];
  onRegisterEditorDraftFlush: WorkspaceLayoutDocumentProps['onRegisterEditorDraftFlush'];
  onPastedTextAnchors: WorkspaceLayoutDocumentProps['onPastedTextAnchors'];
  onEnterPriorityQuickSet: WorkspaceLayoutDocumentProps['onEnterPriorityQuickSet'];
  onOpenPostponeTopicPanel: WorkspaceLayoutReviewProps['onOpenPostponeTopicPanel'];
  onNodeContentChange: WorkspaceLayoutDocumentProps['onNodeContentChange'];
  setNodeViewState: WorkspaceLayoutDocumentProps['setNodeViewState'];
  onEditorReady: WorkspaceLayoutDocumentProps['onEditorReady'];
  onOpenNotesView: () => void;
  onOpenReviewView: () => void;
  onReviewQueueEmpty: () => void;
  onCreateChildNode: WorkspaceLayoutNodeListProps['onCreateChildNode'];
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
  onOpenExternalSelection: WorkspaceLayoutExternalLibraryProps['onOpenExternalSelection'];
  onOpenExternalLibrarySettings: WorkspaceLayoutExternalLibraryProps['onOpenExternalLibrarySettings'];
  onOpenExternalView: WorkspaceLayoutExternalLibraryProps['onOpenExternalView'];
  onChangeExternalFolder: WorkspaceLayoutExternalLibraryProps['onChangeExternalFolder'];
  onRemoveExternalFolder: WorkspaceLayoutExternalLibraryProps['onRemoveExternalFolder'];
  onRescanExternalFolder: WorkspaceLayoutExternalLibraryProps['onRescanExternalFolder'];
  onResetLayout: () => void;
  onSelectTrashNode: WorkspaceLayoutTrashProps['onSelectTrashNode'];
  onRevealAnchorInDocument: WorkspaceLayoutDocumentProps['onRevealAnchorInDocument'];
  onPersistPdfViewState: WorkspaceLayoutDocumentProps['onPersistPdfViewState'];
  onRevealDocumentPosition: WorkspaceLayoutDocumentProps['onRevealDocumentPosition'];
  onRevealDocumentSelection: WorkspaceLayoutDocumentProps['onRevealDocumentSelection'];
  onResolveDocumentPositionAtViewportY: WorkspaceLayoutDocumentProps['onResolveDocumentPositionAtViewportY'];
  beginApplyingReadingPosition: WorkspaceLayoutReadingPositionProps['beginApplyingReadingPosition'];
  completeApplyingReadingPosition: WorkspaceLayoutReadingPositionProps['completeApplyingReadingPosition'];
  getReadingPositionRestoreCommand: WorkspaceLayoutReadingPositionProps['getReadingPositionRestoreCommand'];
  getReadingPositionSelection: WorkspaceLayoutReadingPositionProps['getReadingPositionSelection'];
  getReadingPositionSyncState: WorkspaceLayoutReadingPositionProps['getReadingPositionSyncState'];
  getReadingPositionTargetViewportMode: WorkspaceLayoutReadingPositionProps['getReadingPositionTargetViewportMode'];
  getReadingPositionTargetViewportRatio: WorkspaceLayoutReadingPositionProps['getReadingPositionTargetViewportRatio'];
  setReadingPositionSelection: WorkspaceLayoutReadingPositionProps['setReadingPositionSelection'];
  onRightSidebarSplitterKeyDown: WorkspaceLayoutChromeProps['onRightSidebarSplitterKeyDown'];
  onRightSidebarSplitterPointerDown: WorkspaceLayoutChromeProps['onRightSidebarSplitterPointerDown'];
  onSplitterKeyDown: WorkspaceLayoutChromeProps['onSplitterKeyDown'];
  onSplitterPointerDown: WorkspaceLayoutChromeProps['onSplitterPointerDown'];
  onToggleListVisibility: () => void;
  onToggleBothSidebarVisibility: () => void;
  onToggleImmersiveMode: () => void;
  onToggleRightSidebarVisibility: () => void;
  onRunImportFile: WorkspaceLayoutImportProps['onRunImportFile'];
  onRunImportFolder: WorkspaceLayoutImportProps['onRunImportFolder'];
  onStartClipboardImport: WorkspaceLayoutImportProps['onStartClipboardImport'];
  priorityQuickSetShortcutLabel: string;
  reviewPreview: SchedulerPreviewResult | null;
  reviewSession: WorkspaceState['reviewSession'];
  reviewSessionMode: WorkspaceState['reviewSessionMode'];
  setReviewSessionMode: WorkspaceState['setReviewSessionMode'];
  onResumeReviewItem: () => void;
  selectedTrashNodeId: string | null;
  showAnswerSection: boolean;
  continueReviewSessionReading: WorkspaceState['continueReviewSessionReading'];
  startStudyMode: (options?: StartStudyModeOptions) => void;
  startReviewSession: WorkspaceState['startReviewSession'];
  trashedNodeIds: string[];
  exitReviewSession: WorkspaceState['exitReviewSession'];
  exitStudyMode: () => void;
  updateGrade: (grade: ReviewGrade) => Promise<boolean>;
  readReviewTopic: WorkspaceState['readReviewTopic'];
  postponeReviewTopic: () => Promise<boolean>;
  dismissReviewTopic: () => Promise<boolean>;
  revisitReviewTopicSoon: () => Promise<boolean>;
  revealReviewAnswer: () => void;
}
