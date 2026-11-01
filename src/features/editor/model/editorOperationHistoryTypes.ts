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
  answerPresenceChange?: { before: boolean; after: boolean };
  beforeSelection: EditorOperationSelectionSnapshot;
  afterSelection: EditorOperationSelectionSnapshot;
  nativeState?: EditorState;
  nativeBefore?: import('./nativeTextHistoryGroups').NativeTextHistoryGroups;
  timestamp: number;
  title: 'Edit Text';
  userEvent: string;
}

export interface EditorTextEditOperationEntry {
  applicationOperationId?: string;
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
  persistence?: Promise<boolean>;
  save?: import('./editorTextReplaySave').EditorTextReplaySave;
  nativeState: EditorState;
}

export interface EditorAnnotationOperationState {
  applicationOperationId?: string;
  historyFacts?: import('../../../../lib/core/nodes/annotationHistoryFacts').AnnotationHistoryFact[];
  historyDeletedAt?: string | null;
  historyParents?: Array<{
    nodeId: string;
    before: import('../../../../lib/platform/nativeWorkspaceNodeContract').NativeWorkspaceImageRegionGroup[] | null;
    after: import('../../../../lib/platform/nativeWorkspaceNodeContract').NativeWorkspaceImageRegionGroup[] | null;
  }>;

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
  application?: import('../../../store/workspaceApplicationHistory').ApplicationHistory | undefined;
  nativeTextStates: Record<string, EditorState>;
  invalidations: EditorOperationHistoryInvalidation[];
  recentNodeIds: string[];
  sessionsByNodeId: Record<string, EditorOperationHistorySession | undefined>;
}
