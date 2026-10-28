import type { NodeOpenState } from '../../lib/core/database/nodeOpenState';
import type { DailyFlowSession as ReviewSessionState } from '../../lib/core/flow/dailyFlowSession';
import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { EditorOperationHistoryEntry, EditorOperationHistoryState, EditorTextEditOperationEntry } from '../features/editor/model/editorOperationHistory';
import type { FormulaClozeCreatePayload, FormulaClozeSourcePayload } from '../features/formula-cloze/model/formulaCloze';
import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from '../features/image-cloze/model/imageCloze';
import type { NodeDismissTargets } from '../features/nodes/model/nodeDismissTargets';
import type { Node, NodeAnchorLink, NodeImageRegionGroup, PdfAnchorLocator, TextAnchorLocator } from '../features/nodes/model/nodeTypes';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import type { ReviewGrade } from '../features/review/model/reviewTypes';

import type { WorkspaceActionHistoryState } from './workspaceActionHistory';
import type { WorkspaceBrowseRootIntent } from './workspaceBrowseRoot';
import type { NodeNavigationResult, WorkspaceNavigationState } from './workspaceNavigation';

export interface WorkspaceState {
  browserDailyFlow?: import('../shared/platform/runtime/browserDailyFlowState').BrowserDailyFlowState;
  libraryScope?: string;
  activeNodeId: string | null;
  browseRootNodeId: string;
  appActionHistory: WorkspaceActionHistoryState;
  capturedWorkspaceVersion: string | null;
  editorOperationHistory: EditorOperationHistoryState;
  isHydrated: boolean;
  workspaceHydrationError: string | null;
  layout: WorkspaceLayoutState;
  navigation: WorkspaceNavigationState;
  nodeOpenStateById: Record<string, NodeOpenState | undefined>;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  rendererBoundaryKeepNodeIds: string[];
  reviewSession: ReviewSessionState;
  reviewSessionMode: ReviewSessionMode;
  reviewSessionModeExpiresAt: string | null;
  trashedNodeDeletedAtById: Record<string, string | undefined>;
  trashedNodeIds: string[];
  untitledSequenceByParent: Record<string, number>;
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  goToLastChild: () => NodeNavigationResult | null;
  jumpToAncestorNode: (ancestorNodeId: string) => NodeNavigationResult | null;
  openNode: (nodeId: string, browseRootIntent?: WorkspaceBrowseRootIntent) => NodeNavigationResult | null;
  resetLayout: () => void;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
  setDocumentMaxWidth: (width: number) => void;
  setListWidth: (width: number) => void;
  setListCollapsed: (collapsed: boolean) => void;
  setRightSidebarWidth: (width: number) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
  setActiveNode: (nodeId: string | null) => void;
  setBrowseRootNode: (nodeId: string) => void;
  updateNodeTitle: (nodeId: string, title: string) => Promise<boolean>;
  updateNodeDerivedTitle: (nodeId: string, content?: string) => Promise<boolean>;
  updateNodeContent: (nodeId: string, content: string, options?: WorkspaceNodeContentOptions) => Promise<boolean>;
  updateHighlightAnchorRange?: (highlightNodeId: string, range: { from: number; to: number }) => boolean;
  updateVirtualNodeFilter: (nodeId: string, value: string) => void;
  updateNodeReveal: (nodeId: string, reveal: string) => Promise<boolean>;
  updateNodePriority: (nodeId: string, priority: number | null) => void;
  updateNodeDesiredRetention: (nodeId: string, desiredRetention: number | null) => void;
  updateNodeShortTerm: (nodeId: string, enableShortTerm: boolean | null) => void;
  setNodeSequentialReading: (nodeId: string, enabled: boolean, now?: string) => boolean | Promise<boolean>;
  setFolderManualChildOrder?: (folderNodeId: string, manualChildOrder: string[], now?: string) => boolean | Promise<boolean>;
  shelveNode: (nodeId: string, now?: string) => boolean;
  unshelveNode: (nodeId: string, now?: string) => boolean;
  dismissNode: (nodeId: string, now?: string) => boolean;
  dismissNodes: (targets: NodeDismissTargets, now?: string) => boolean;
  undoWorkspaceAction: (now?: string) => boolean | Promise<boolean>;
  redoWorkspaceAction: (now?: string) => boolean | Promise<boolean>;
  pushEditorOperationEntry: (entry: EditorOperationHistoryEntry) => void;
  deleteEditorAnnotationNodes: (nodeIds: string[]) => void;
  undoEditorOperation: (context?: EditorOperationApplyContext) => boolean;
  redoEditorOperation: (context?: EditorOperationApplyContext) => boolean;
  settleEditorAnnotationCreation: (args: { annotationNodeIds: string[]; nodeId: string; succeeded: boolean }) => void;
  relearnNode: (nodeId: string, now?: string) => boolean;
  startReviewSession: (now?: string, options?: ReviewSessionStartOptions) => boolean | Promise<boolean>;
  continueReviewSessionReading: (now?: string) => boolean | Promise<boolean>;
  resumeReviewSession: (now?: string, options?: ReviewSessionResumeOptions) => string | false | Promise<string | false>;
  setReviewSessionMode: (mode: ReviewSessionMode, now?: string) => void | Promise<void>;
  revealReviewAnswer: () => void;
  gradeReviewCard: (grade: ReviewGrade, now?: string) => Promise<boolean>;
  readReviewTopic: (now?: string, options?: ReadReviewTopicOptions) => Promise<boolean>;
  postponeReviewTopic: (now?: string) => Promise<boolean>;
  setReviewTopicDelay: (nodeId: string, delayLevel: number, now?: string) => Promise<boolean>;
  revisitReviewTopicSoon: (now?: string) => Promise<boolean>;
  dismissReviewTopic: (now?: string) => Promise<boolean>;
  exitReviewSession: () => void;
  deleteNode: (nodeId: string) => void;
  deleteImageClozeRegion: (parentNodeId: string, attachmentId: string, regionId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
  restoreNode: (nodeId: string) => Promise<string | null>;
  deleteNodePermanently: (nodeId: string) => void;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  createRootNode: (content?: string, kind?: NodeKind, options?: WorkspaceNodeCreationOptions) => Promise<string | null>;
  createChildNode: (parentNodeId: string, content?: string, kind?: NodeKind, options?: WorkspaceNodeCreationOptions) => Promise<string | null>;
  createVirtualNode: (options?: { mode?: 'manual' | 'saved-search'; parentNodeId?: string }) => Promise<string | null>;
  createHighlightNodeFromSelection: (parentNodeId: string, content: string, anchorId?: string, anchorLink?: NodeAnchorLink, imageRegions?: NodeImageRegionGroup[] | null) => Promise<string | null>;
  createPdfImageExcerpt?: (parentNodeId: string, locator: PdfAnchorLocator | TextAnchorLocator, imageRegions: NodeImageRegionGroup[] | null, attachmentId: string, bytesBase64: string, content?: string) => Promise<string | null>;
  createQANodeFromSelection: (parentNodeId: string, promptContent: string, answerContent: string, anchorId?: string, anchorLink?: NodeAnchorLink) => Promise<string | null>;
  createImageClozeNodes: (parentNodeId: string, attachmentId: string, sourcePayload: ImageClozeSourcePayload, regions: ImageClozeDraftRegion[]) => Promise<string[]>;
  createFormulaClozeNode: (parentNodeId: string, payload: FormulaClozeCreatePayload, sourcePayload: FormulaClozeSourcePayload) => Promise<string | null>;
  moveNode: (nodeId: string, nextParentNodeId: string | null) => Promise<boolean>;
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: 'before' | 'after' | 'child' | 'root') => Promise<boolean>;
}

export interface EditorOperationApplyContext {
  applyText: (entry: EditorTextEditOperationEntry, mode: 'redo' | 'undo') => boolean;
  currentContent: string;
  getCurrentContent?: () => string;
  nodeId: string;
}

export type ReviewSessionStartOptions = Record<string, never>;

export interface ReviewSessionResumeOptions {
  preferredNodeId?: string | null;
}

export interface ReadReviewTopicOptions {
  releaseSequentialReading?: boolean;
}

export interface WorkspaceNodeContentOptions {
  baseContent?: string;
  baseVersionId?: string | null;
  newImageReferences?: readonly import('../../lib/core/sync/localContentEditResources').ContentImageReference[] | undefined;
  deriveTitle?: boolean;
  preserveTitle?: boolean;
  publishLocal?: boolean;
}

export interface WorkspaceNodeCreationOptions {
  activate?: boolean;
  newImageReferences?: readonly import('../../lib/core/sync/localContentEditResources').ContentImageReference[] | undefined;
  priority?: number | null;
}

export interface WorkspacePersistedState {
  browserDailyFlow?: import('../shared/platform/runtime/browserDailyFlowState').BrowserDailyFlowState;
  appActionHistory?: import('./workspaceActionHistoryState').WorkspaceActionHistoryState;
  libraryScope?: string;
  activeNodeId: string | null;
  browseRootNodeId?: string;
  capturedWorkspaceVersion?: string | null;
  layout: WorkspaceLayoutState;
  nodeOpenStateById?: Record<string, NodeOpenState | undefined>;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  reviewSession: ReviewSessionState;
  reviewSessionMode?: ReviewSessionMode;
  reviewSessionModeExpiresAt?: string | null;
  rendererBoundaryKeepNodeIds?: string[];
  trashedNodeDeletedAtById: Record<string, string | undefined>;
  trashedNodeIds: string[];
  untitledSequenceByParent: Record<string, number>;
}

export interface WorkspaceLayoutState {
  documentMaxWidth: number;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  listWidth: number;
  rightSidebarWidth: number;
}

export type { DailyFlowSession as ReviewSessionState } from '../../lib/core/flow/dailyFlowSession';

export interface NodeViewState {
  scrollTop: number;
  selection: {
    from: number;
    to: number;
  } | null;
  updatedAt?: string | null;
}
