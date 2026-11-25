import type { NativeWorkspaceReadingProfile } from './nativeReadingContract.js';

export interface NativeSaveNodeReadingStateArgs {
  nodeId: string;
  reading: NativeWorkspaceReadingProfile | null;
  updatedAt: string;
  completedReviewDay?: string;
  /** Undo and redo restore a profile that must win sync against the reading it replaces. */
  historyOrder?: boolean;
}
