import type { NodeViewStateWriteSource } from './persistedNodeViewState.js';

export interface NativeReadingResumeContext {
  nodeId: string;
  contentHash: string;
  clock: Record<string, number>;
  libraryEpoch: string;
  offset: number | null;
}

export interface NativeReadingProgressNodeViewState {
  nodeId: string;
  scrollTop: number;
  readingOffset?: number;
  selectionFrom: number | null;
  selectionTo: number | null;
  updatedAt?: string | null;
}

export interface NativeReadingProgressSnapshot {
  activeNodeId: string | null;
  browseRootNodeId?: string | null;
  nodeViewStateById: Record<
    string,
    { scrollTop: number; readingOffset?: number; selectionFrom: number | null; selectionTo: number | null; updatedAt: string }
  >;
}

export interface NativeSaveReadingProgressArgs {
  activeNodeId: string | null;
  browseRootNodeId?: string;
  nodeViewStates: NativeReadingProgressNodeViewState[];
  source?: NodeViewStateWriteSource;
  readingResume?: NativeReadingResumeContext;
  updatedAt: string;
}
