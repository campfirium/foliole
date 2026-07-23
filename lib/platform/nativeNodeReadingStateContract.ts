import type { NativeWorkspaceReadingProfile } from './nativeReadingContract.js';

export interface NativeSaveNodeReadingStateArgs {
  nodeId: string;
  reading: NativeWorkspaceReadingProfile | null;
  updatedAt: string;
}
