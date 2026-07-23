import type { NativeWorkspaceReviewProfile } from './nativeStorageContract.js';

export interface NativeSaveNodeReviewStateArgs {
  nodeId: string;
  review: NativeWorkspaceReviewProfile;
  updatedAt: string;
}
