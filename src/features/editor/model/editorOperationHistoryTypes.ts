import type { ChangeSet, EditorState, Text } from '@codemirror/state';

export interface EditorOperationSelectionSnapshot {
  mainIndex: number;
  ranges: Array<{ anchor: number; head: number }>;
}

export interface EditorAnnotationOperationSnapshot {
  review?: import('../../../../lib/platform/nativeStorageContract').NativeWorkspaceReviewProfile | null;
  beforeVersionId?: string;
  afterVersionId?: string;
  anchorId?: string;
  kind: 'cloze' | 'highlight' | 'image-excerpt' | 'note';
  nodeId: string;
  orderIndex?: number;
  parentNodeId: string;
}

export interface EditorTextOperationTarget {
  nodeId: string;
  field: 'content' | 'reveal';
  beforeVersionId: string;
  afterVersionId: string;
}

export interface EditorTextHistoryInput {
  type: 'text.input';
  inputOrder?: number;
  nodeId: string;
  target?: EditorTextOperationTarget;
  beforeDoc: Text;
  changes?: ChangeSet;
  beforeSelection: EditorOperationSelectionSnapshot;
  afterSelection: EditorOperationSelectionSnapshot;
  nativeState?: EditorState;
  nativeBefore?: import('./nativeTextHistoryGroups').NativeTextHistoryGroups;
  timestamp: number;
  title: 'Edit Text';
  userEvent: string;
}

export interface EditorTextEditOperationEntry {
  type: 'text.edit';
  nodeId: string;
  target?: EditorTextOperationTarget;
  nativeTargetKey: string;
  nativeGroup: object;
  afterSelection: EditorOperationSelectionSnapshot;
  nativeState?: EditorState;
  timestamp: number;
  title: 'Edit Text';
  userEvent: string;
}

export interface EditorTextHistoryReplayResult {
  nativeState: EditorState;
}

export interface EditorAnnotationOperationState {
  applyingMode?: 'redo' | 'undo';
  canonical: 'confirmed' | 'pending';
}

export interface EditorAnnotationCreateOperationEntry extends EditorAnnotationOperationState {
  annotations: EditorAnnotationOperationSnapshot[];
  nodeId: string;
  title: 'Create Annotation';
  type: 'annotation.create';
}

export interface EditorAnnotationDeleteOperationEntry extends EditorAnnotationOperationState {
  annotations: EditorAnnotationOperationSnapshot[];
  nodeId: string;
  title: 'Delete Annotation';
  type: 'annotation.delete';
}

export type EditorAnnotationOperationEntry =
  | EditorAnnotationCreateOperationEntry
  | EditorAnnotationDeleteOperationEntry;

export type EditorOperationHistoryEntry = EditorAnnotationOperationEntry | EditorTextEditOperationEntry;

export interface EditorOperationHistorySession {
  textBoundary?: object;
  externalTextBoundary?: object;
  redoStack: EditorOperationHistoryEntry[];
  undoStack: EditorOperationHistoryEntry[];
}

export interface EditorOperationHistoryInvalidation {
  nodeId: string;
  reason: string;
}

export type EditorOperationHistoryInput = EditorAnnotationOperationEntry | EditorTextHistoryInput;

export interface EditorOperationHistoryState {
  nativeTextStates: Record<string, EditorState>;
  invalidations: EditorOperationHistoryInvalidation[];
  recentNodeIds: string[];
  sessionsByNodeId: Record<string, EditorOperationHistorySession | undefined>;
}
