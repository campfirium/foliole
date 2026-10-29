import type {
  NativeNodeAnchorLocatorUpdateArgs,
  NativeNodeSnapshotArgs,
  NativeWorkspaceImageRegionGroup
} from './nativeStorageContract.js';

type NativeNodeAnchorUpdateArgs = NativeNodeAnchorLocatorUpdateArgs & {
  imageRegions?: NativeWorkspaceImageRegionGroup[] | null;
};

export interface NativeNodeMutationPatchResult {
  contentEdit?: { currentVersionId: string; submittedVersionId: string };
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
  newImageReferences?: readonly import('../core/sync/localContentEditResources.js').ContentImageReference[];
  activeNodeId?: string | null;
};

interface NativeSplitTopicMutationBaseArgs {
  activeNodeId: string;
  generatedNodes: NativeNodeSnapshotArgs[];
  nodeOrder: string[];
  sourceNodeId: string;
  sourceParentNodeId: string | null;
}

export interface NativePartitionBodyMutationArgs {
  disposition: 'partition-body';
  sourceNodeId: string;
  expectedContent: string;
  content: string;
}

export type NativeSplitTopicMutationArgs = NativePartitionBodyMutationArgs | NativeSplitTopicMutationBaseArgs & (
  | { deletedAt: string; disposition: 'replace' }
  | { disposition: 'keep-as-parent' }
);

export type NativeNodeSnapshotMutationSpec = {
  args: NativeNodeSnapshotArgs;
  result: NativeNodeMutationPatchResult;
};

export type NativeNodeCreationMutationSpec = {
  args: NativeNodeCreationMutationArgs;
  result: NativeNodeMutationPatchResult;
};

export type NativePdfImageExcerptCreationMutationSpec = {
  args: NativeNodeCreationMutationArgs & {
    attachmentId: string;
    bytesBase64: string;
    originalName: string;
  };
  result: NativeNodeMutationPatchResult;
};

export type NativeSplitTopicMutationSpec = {
  args: NativeSplitTopicMutationArgs;
  result: NativeNodeMutationPatchResult;
};

export type NativeNodeSnapshotBatchMutationSpec = {
  args: { parent: NativeNodeSnapshotArgs; affectedAnchors: NativeNodeAnchorUpdateArgs[]; edit?: import('../core/sync/localContentEdit.js').LocalContentEdit };
  result: NativeNodeMutationPatchResult;
};

export type { NativeMoveNodesArgs, NativeMoveNodesResult, NativeMoveNodePatch } from './nativeMoveContract.js';

export interface NativeRestoreNodesResult {
  restoredNodeIds: string[];
  nodeOrder?: string[];
  manualParentOrders?: Array<{ parentNodeId: string; childIds: string[]; updatedAt: string }>;
  skippedConflicts: Array<{
    liveNodeId: string;
    trashNodeId: string;
  }>;
}

export interface NativeSoftDeleteNodesResult {
  deletedNodeIds: string[];
}

export interface NativeDeleteNodesPermanentlyResult {
  removedNodeIds: string[];
}
