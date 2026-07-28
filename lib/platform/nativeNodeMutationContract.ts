import type {
  NativeNodeAnchorLocatorUpdateArgs,
  NativeNodeSnapshotArgs,
  NativeWorkspaceImageRegionGroup
} from './nativeStorageContract.js';

type NativeNodeAnchorUpdateArgs = NativeNodeAnchorLocatorUpdateArgs & {
  imageRegions?: NativeWorkspaceImageRegionGroup[] | null;
};

export interface NativeNodeMutationPatchResult {
  activeNodeId?: string | null;
  anchorUpdates?: NativeNodeAnchorUpdateArgs[];
  createdNodeIds?: string[];
  deletedNodeIds?: string[];
  collectionRenames?: Array<{
    from: string;
    nodeIds: string[];
    to: string;
  }>;
  nodeOrder?: string[];
  nodes: NativeNodeSnapshotArgs[];
  skippedNodeIds?: string[];
  updatedNodeIds?: string[];
}

export type NativeNodeCreationMutationArgs = NativeNodeSnapshotArgs & {
  activeNodeId?: string | null;
  nodeOrder: string[];
};

export interface NativeSplitTopicMutationArgs {
  activeNodeId: string;
  deletedAt: string;
  generatedNodes: NativeNodeSnapshotArgs[];
  nodeOrder: string[];
  sourceNodeId: string;
}

export type NativeNodeSnapshotMutationSpec = {
  args: NativeNodeSnapshotArgs;
  result: NativeNodeMutationPatchResult;
};

export type NativeNodeCreationMutationSpec = {
  args: NativeNodeCreationMutationArgs;
  result: NativeNodeMutationPatchResult;
};

export type NativeSplitTopicMutationSpec = {
  args: NativeSplitTopicMutationArgs;
  result: NativeNodeMutationPatchResult;
};

export type NativeNodeSnapshotBatchMutationSpec = {
  args: { parent: NativeNodeSnapshotArgs; affectedAnchors: NativeNodeAnchorUpdateArgs[] };
  result: NativeNodeMutationPatchResult;
};

export interface NativeMoveNodesArgs {
  nodeOrder: string[];
  nodes: NativeMoveNodePatch[];
}

export interface NativeMoveNodePatch {
  nodeId: string;
  parentNodeId: string | null;
  reading?: NativeNodeSnapshotArgs['reading'];
  sequentialReadingEnabled?: boolean | null;
  updatedAt: string;
}

export interface NativeMoveNodesResult {
  movedNodeIds: string[];
  nodeOrder: string[];
}

export interface NativeRestoreNodesResult {
  restoredNodeIds: string[];
  skippedConflicts: Array<{
    liveNodeId: string;
    trashNodeId: string;
  }>;
}

export interface NativeSoftDeleteNodesResult {
  deletedNodeIds: string[];
}

export interface NativeDeleteNodesPermanentlyResult {
  nodeOrder: string[];
  removedNodeIds: string[];
}
