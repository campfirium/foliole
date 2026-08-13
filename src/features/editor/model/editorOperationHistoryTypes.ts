import type { ChangeSet } from '@codemirror/state';

export interface EditorOperationSelectionSnapshot {
  mainIndex: number;
  ranges: Array<{ anchor: number; head: number }>;
}

export interface EditorAnnotationOperationSnapshot {
  anchorId?: string;
  kind: 'cloze' | 'highlight' | 'note';
  nodeId: string;
  orderIndex?: number;
  parentNodeId: string;
}

export interface EditorTextEditOperationEntry {
  afterContent: string;
  afterSelection: EditorOperationSelectionSnapshot;
  beforeContent: string;
  beforeSelection: EditorOperationSelectionSnapshot;
  forwardChanges: ChangeSet;
  inverseChanges: ChangeSet;
  nodeId: string;
  timestamp: number;
  title: 'Edit Text';
  type: 'text.edit';
  userEvent: string;
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
  redoStack: EditorOperationHistoryEntry[];
  undoStack: EditorOperationHistoryEntry[];
}

export interface EditorOperationHistoryInvalidation {
  nodeId: string;
  reason: string;
}

export interface EditorOperationHistoryState {
  invalidations: EditorOperationHistoryInvalidation[];
  recentNodeIds: string[];
  sessionsByNodeId: Record<string, EditorOperationHistorySession | undefined>;
}
