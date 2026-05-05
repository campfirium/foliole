import type { NativeNodeAnchorLocatorUpdateArgs, NativeNodeSnapshotArgs } from './nativeStorageContract.js';

export type NativeNodeSnapshotMutationSpec = {
  args: NativeNodeSnapshotArgs;
  result: null;
};

export type NativeNodeSnapshotBatchMutationSpec = {
  args: { parent: NativeNodeSnapshotArgs; affectedAnchors: NativeNodeAnchorLocatorUpdateArgs[] };
  result: null;
};
