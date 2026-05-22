import type { NodeViewStateWriteSource } from './persistedNodeViewState.js';

export interface NativeReadingProgressNodeViewState {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
  updatedAt?: string | null;
}

export interface NativeReadingProgressSnapshot {
  activeNodeId: string | null;
  nodeViewStateById: Record<
    string,
    { scrollTop: number; selectionFrom: number | null; selectionTo: number | null; updatedAt: string }
  >;
}

export interface NativeSaveReadingProgressArgs {
  activeNodeId: string | null;
  nodeViewStates: NativeReadingProgressNodeViewState[];
  source?: NodeViewStateWriteSource;
  updatedAt: string;
}
