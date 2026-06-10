import type { Translate } from '../../../shared/localization/LocalizationProvider';

const DEFAULT_EDITOR_OPERATION_HISTORY_LIMIT = 50;

interface EditorOperationSelectionSnapshot {
  from: number;
  to: number;
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
  afterSelection?: EditorOperationSelectionSnapshot | null;
  beforeContent: string;
  beforeSelection?: EditorOperationSelectionSnapshot | null;
  nodeId: string;
  title: 'Edit Text';
  type: 'text.edit';
}

interface EditorAnnotationCreateOperationEntry {
  annotations: EditorAnnotationOperationSnapshot[];
  nodeId: string;
  title: 'Create Annotation';
  type: 'annotation.create';
}

interface EditorAnnotationDeleteOperationEntry {
  annotations: EditorAnnotationOperationSnapshot[];
  nodeId: string;
  title: 'Delete Annotation';
  type: 'annotation.delete';
}

export type EditorOperationHistoryEntry =
  | EditorAnnotationCreateOperationEntry
  | EditorAnnotationDeleteOperationEntry
  | EditorTextEditOperationEntry;

export interface EditorOperationHistoryState {
  redoStack: EditorOperationHistoryEntry[];
  undoStack: EditorOperationHistoryEntry[];
}

export interface ApplyEditorOperationHistoryArgs {
  applyEntry: (entry: EditorOperationHistoryEntry, mode: 'redo' | 'undo') => boolean;
  currentNodeId: string | null | undefined;
  history: EditorOperationHistoryState;
  mode: 'redo' | 'undo';
}

export function createEmptyEditorOperationHistory(): EditorOperationHistoryState {
  return { redoStack: [], undoStack: [] };
}

export function pushEditorOperationEntry(
  history: EditorOperationHistoryState,
  entry: EditorOperationHistoryEntry,
  limit = DEFAULT_EDITOR_OPERATION_HISTORY_LIMIT
): EditorOperationHistoryState {
  return {
    redoStack: [],
    undoStack: trimEditorOperationStack([...history.undoStack, entry], limit)
  };
}

export function applyEditorOperationHistory(args: ApplyEditorOperationHistoryArgs): {
  entry: EditorOperationHistoryEntry | null;
  history: EditorOperationHistoryState;
  applied: boolean;
} {
  const entry = getEditorOperationTopEntry(args.history, args.mode);
  if (!entry || !canApplyEditorOperationEntryForCurrentNode(entry, args.currentNodeId) || !args.applyEntry(entry, args.mode)) {
    return { applied: false, entry, history: args.history };
  }
  return {
    applied: true,
    entry,
    history: moveEditorOperationEntry(args.history, entry, args.mode)
  };
}

export function canApplyEditorOperationEntryForCurrentNode(
  entry: EditorOperationHistoryEntry | null | undefined,
  currentNodeId: string | null | undefined
) {
  if (!entry) {
    return false;
  }
  return entry.type === 'text.edit' ? entry.nodeId === currentNodeId : true;
}

function getEditorOperationTitle(entry: EditorOperationHistoryEntry, t: Translate) {
  if (entry.type === 'text.edit') return t('desktop.command.editorOperation.editText');
  if (entry.type === 'annotation.create') return t('desktop.command.editorOperation.createAnnotation');
  return t('desktop.command.editorOperation.deleteAnnotation');
}

export function getEditorOperationUndoTitle(history: EditorOperationHistoryState, t: Translate) {
  const entry = getEditorOperationTopEntry(history, 'undo');
  return entry ? t('desktop.command.undoOperation', { operation: getEditorOperationTitle(entry, t) }) : t('desktop.command.undo');
}

export function getEditorOperationRedoTitle(history: EditorOperationHistoryState, t: Translate) {
  const entry = getEditorOperationTopEntry(history, 'redo');
  return entry ? t('desktop.command.redoOperation', { operation: getEditorOperationTitle(entry, t) }) : t('desktop.command.redo');
}

function getEditorOperationTopEntry(history: EditorOperationHistoryState, mode: 'redo' | 'undo') {
  const stack = mode === 'undo' ? history.undoStack : history.redoStack;
  return stack[stack.length - 1] ?? null;
}

function moveEditorOperationEntry(
  history: EditorOperationHistoryState,
  entry: EditorOperationHistoryEntry,
  mode: 'redo' | 'undo'
): EditorOperationHistoryState {
  if (mode === 'undo') {
    return {
      redoStack: trimEditorOperationStack([...history.redoStack, entry]),
      undoStack: history.undoStack.slice(0, -1)
    };
  }
  return {
    redoStack: history.redoStack.slice(0, -1),
    undoStack: trimEditorOperationStack([...history.undoStack, entry])
  };
}

function trimEditorOperationStack(
  stack: EditorOperationHistoryEntry[],
  limit = DEFAULT_EDITOR_OPERATION_HISTORY_LIMIT
) {
  return stack.slice(Math.max(0, stack.length - limit));
}
