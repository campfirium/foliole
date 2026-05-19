import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from '../features/image-cloze/model/imageCloze';
import type { Node, NodeAnchorLink, NodeImageRegionGroup } from '../features/nodes/model/nodeTypes';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import type { ReviewGrade } from '../features/review/model/reviewTypes';

import type { WorkspaceActionHistoryState } from './workspaceActionHistory';
import type { NodeNavigationResult, WorkspaceNavigationState } from './workspaceNavigation';

export interface WorkspaceState {
  activeNodeId: string | null;
  appActionHistory: WorkspaceActionHistoryState;
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
  updateNodeTitle: (nodeId: string, title: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  updateHighlightAnchorRange?: (highlightNodeId: string, range: { from: number; to: number }) => boolean;
  updateVirtualNodeFilter: (nodeId: string, value: string) => void;
  updateNodeReveal: (nodeId: string, reveal: string) => void;
  updateNodePriority: (nodeId: string, priority: number | null) => void;
  updateNodeDesiredRetention: (nodeId: string, desiredRetention: number | null) => void;
  dismissNode: (nodeId: string, now?: string) => boolean;
  undoWorkspaceAction: (now?: string) => boolean;
  redoWorkspaceAction: (now?: string) => boolean;
  relearnNode: (nodeId: string, now?: string) => boolean;
  startReviewSession: (now?: string) => boolean;
  setReviewSessionMode: (mode: ReviewSessionMode, now?: string) => void;
  revealReviewAnswer: () => void;
  gradeReviewCard: (grade: ReviewGrade, now?: string) => Promise<boolean>;
  completeReviewItem: (now?: string) => boolean;
  deferReviewItem: () => boolean;
  dismissReviewItem: (now?: string) => boolean;
  exitReviewSession: () => void;
  deleteNode: (nodeId: string) => void;
  deleteImageClozeRegion: (parentNodeId: string, attachmentId: string, regionId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
  restoreNode: (nodeId: string) => Promise<string | null>;
  deleteNodePermanently: (nodeId: string) => void;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  createRootNode: (content?: string, kind?: NodeKind) => string;
  createChildNode: (parentNodeId: string, content?: string, kind?: NodeKind) => string;
  createVirtualNode: () => string;
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    content: string,
    anchorId?: string,
    anchorLink?: NodeAnchorLink,
    imageRegions?: NodeImageRegionGroup[] | null
  ) => string | null;
  createQANodeFromSelection: (
    parentNodeId: string,
    promptContent: string,
    answerContent: string,
    anchorId?: string,
    anchorLink?: NodeAnchorLink
  ) => string | null;
  createImageClozeNodes: (
    parentNodeId: string,
    attachmentId: string,
    sourcePayload: ImageClozeSourcePayload,
    regions: ImageClozeDraftRegion[]
  ) => string[];
  moveNode: (nodeId: string, nextParentNodeId: string | null) => boolean;
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => boolean;
}

export interface WorkspacePersistedState {
  activeNodeId: string | null;
  layout: WorkspaceLayoutState;
  nodeViewById: Record<string, NodeViewState | undefined>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
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
  currentNodeId: string | null;
  isAnswerRevealed: boolean;
  queueNodeIds: string[];
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
