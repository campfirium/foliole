import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type {
  EditorOperationHistoryEntry,
  EditorOperationHistoryState
} from '../features/editor/model/editorOperationHistory';
import type { FormulaClozeCreatePayload, FormulaClozeSourcePayload } from '../features/formula-cloze/model/formulaCloze';
import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from '../features/image-cloze/model/imageCloze';
import type { Node, NodeAnchorLink, NodeImageRegionGroup } from '../features/nodes/model/nodeTypes';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import type { ReviewGrade } from '../features/review/model/reviewTypes';

import type { WorkspaceActionHistoryState } from './workspaceActionHistory';
import type { NodeNavigationResult, WorkspaceNavigationState } from './workspaceNavigation';

export interface WorkspaceState {
  activeNodeId: string | null;
  appActionHistory: WorkspaceActionHistoryState;
  editorOperationHistory: EditorOperationHistoryState;
  isHydrated: boolean;
  workspaceHydrationError: string | null;
  layout: WorkspaceLayoutState;
  navigation: WorkspaceNavigationState;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  rendererBoundaryKeepNodeIds: string[];
  reviewSession: ReviewSessionState;
  reviewSessionMode: ReviewSessionMode;
  trashedNodeDeletedAtById: Record<string, string | undefined>;
  trashedNodeIds: string[];
  untitledSequenceByParent: Record<string, number>;
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (ancestorNodeId: string) => NodeNavigationResult | null;
  openNode: (nodeId: string) => NodeNavigationResult | null;
  resetLayout: () => void;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
  setDocumentMaxWidth: (width: number) => void;
  setListWidth: (width: number) => void;
  setListCollapsed: (collapsed: boolean) => void;
  setRightSidebarWidth: (width: number) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
  setActiveNode: (nodeId: string) => void;
  updateNodeTitle: (nodeId: string, title: string) => Promise<boolean>;
  updateNodeContent: (nodeId: string, content: string) => Promise<boolean>;
  updateHighlightAnchorRange?: (highlightNodeId: string, range: { from: number; to: number }) => boolean;
  updateVirtualNodeFilter: (nodeId: string, value: string) => void;
  updateNodeReveal: (nodeId: string, reveal: string) => Promise<boolean>;
  updateNodePriority: (nodeId: string, priority: number | null) => void;
  updateNodeDesiredRetention: (nodeId: string, desiredRetention: number | null) => void;
  updateNodeShortTerm: (nodeId: string, enableShortTerm: boolean | null) => void;
  setNodeSequentialReading: (nodeId: string, enabled: boolean, now?: string) => boolean;
  setFolderManualChildOrder?: (folderNodeId: string, manualChildOrder: string[], now?: string) => boolean;
  dismissNode: (nodeId: string, now?: string) => boolean;
  undoWorkspaceAction: (now?: string) => boolean;
  redoWorkspaceAction: (now?: string) => boolean;
  pushEditorOperationEntry: (entry: EditorOperationHistoryEntry) => void;
  deleteEditorAnnotationNodes: (nodeIds: string[]) => void;
  undoEditorOperation: () => boolean;
  redoEditorOperation: () => boolean;
  relearnNode: (nodeId: string, now?: string) => boolean;
  startReviewSession: (now?: string) => boolean;
  resumeReviewSession: (now?: string) => boolean;
  setReviewSessionMode: (mode: ReviewSessionMode, now?: string) => void;
  revealReviewAnswer: () => void;
  gradeReviewCard: (grade: ReviewGrade, now?: string) => Promise<boolean>;
  readReviewTopic: (now?: string) => Promise<boolean>;
  postponeReviewTopic: () => Promise<boolean>;
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
  createRootNode: (content?: string, kind?: NodeKind) => Promise<string | null>;
  createChildNode: (parentNodeId: string, content?: string, kind?: NodeKind) => Promise<string | null>;
  createVirtualNode: () => Promise<string | null>;
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    content: string,
    anchorId?: string,
    anchorLink?: NodeAnchorLink,
    imageRegions?: NodeImageRegionGroup[] | null
  ) => Promise<string | null>;
  createQANodeFromSelection: (
    parentNodeId: string,
    promptContent: string,
    answerContent: string,
    anchorId?: string,
    anchorLink?: NodeAnchorLink
  ) => Promise<string | null>;
  createImageClozeNodes: (
    parentNodeId: string,
    attachmentId: string,
    sourcePayload: ImageClozeSourcePayload,
    regions: ImageClozeDraftRegion[]
  ) => Promise<string[]>;
  createFormulaClozeNode: (
    parentNodeId: string,
    payload: FormulaClozeCreatePayload,
    sourcePayload: FormulaClozeSourcePayload
  ) => Promise<string | null>;
  moveNode: (nodeId: string, nextParentNodeId: string | null) => Promise<boolean>;
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => Promise<boolean>;
}

export interface WorkspacePersistedState {
  activeNodeId: string | null;
  capturedWorkspaceVersion?: string | null;
  layout: WorkspaceLayoutState;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  reviewSession: ReviewSessionState;
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

export interface ReviewSessionState {
  completedAt?: string | null;
  continueNodeId?: string | null;
  currentItemStartedAt?: string | null;
  currentNodeId: string | null;
  isAnswerRevealed: boolean;
  queueNodeIds: string[];
  readingElapsedMs?: number;
  readTopicCount?: number;
  reviewElapsedMs?: number;
  reviewedItemCount?: number;
  sessionStartedAt?: string | null;
  soonNodeIds?: string[];
  totalNodeCount: number;
}

export interface NodeViewState {
  scrollTop: number;
  selection: {
    from: number;
    to: number;
  } | null;
  updatedAt?: string | null;
}
