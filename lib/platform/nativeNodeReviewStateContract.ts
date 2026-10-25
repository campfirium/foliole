import type { ReviewHistoryMutation } from '../core/review/reviewEventIdentity.js';

import type { NativeWorkspaceReviewProfile } from './nativeStorageContract.js';

export interface NativeSaveNodeReviewStateArgs {
  nodeId: string;
  review: NativeWorkspaceReviewProfile | null;
  history?: ReviewHistoryMutation;
  updatedAt: string;
}
