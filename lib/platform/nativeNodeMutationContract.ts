import type {
  NativeNodeAnchorLocatorUpdateArgs,
  NativeNodeSnapshotArgs,
  NativeWorkspaceImageRegionGroup
} from './nativeStorageContract.js';

type NativeNodeAnchorUpdateArgs = NativeNodeAnchorLocatorUpdateArgs & {
  imageRegions?: NativeWorkspaceImageRegionGroup[] | null;
};

export type NativeNodeSnapshotMutationSpec = {
  args: NativeNodeSnapshotArgs;
  result: null;
};

export type NativeNodeSnapshotBatchMutationSpec = {
  args: { parent: NativeNodeSnapshotArgs; affectedAnchors: NativeNodeAnchorUpdateArgs[] };
  result: null;
};

export interface NativeRestoreNodesResult {
  restoredNodeIds: string[];
  skippedConflicts: Array<{
    liveNodeId: string;
    trashNodeId: string;
  }>;
}
