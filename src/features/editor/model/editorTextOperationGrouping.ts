import type { ChangeSet } from '@codemirror/state';

import type { EditorTextEditOperationEntry } from './editorOperationHistoryTypes';

const TEXT_HISTORY_GROUP_DELAY_MS = 500;
const JOINABLE_USER_EVENT = /^(input\.type|delete)($|\.)/;

function changesAreAdjacent(previous: ChangeSet, next: ChangeSet) {
  const ranges: number[] = [];
  let adjacent = false;
  previous.iterChangedRanges((from, to) => ranges.push(from, to));
  next.iterChangedRanges((_fromA, _toA, from, to) => {
    for (let index = 0; index < ranges.length; index += 2) {
      if (to >= ranges[index]! && from <= ranges[index + 1]!) adjacent = true;
    }
  });
  return adjacent;
}

function hasRangeSelection(entry: EditorTextEditOperationEntry) {
  return entry.beforeSelection.ranges.some((range) => range.anchor !== range.head);
}

function isIsolatedTextOperation(entry: EditorTextEditOperationEntry) {
  return entry.userEvent === 'input.paste' || entry.userEvent === 'delete.cut' || hasRangeSelection(entry);
}

export function canGroupEditorTextOperations(
  previous: EditorTextEditOperationEntry,
  next: EditorTextEditOperationEntry
) {
  if (previous.nodeId !== next.nodeId || isIsolatedTextOperation(previous) || isIsolatedTextOperation(next)) {
    return false;
  }
  if (next.userEvent === 'input.type.compose') {
    return previous.userEvent.startsWith('input.type.compose');
  }
  return (
    JOINABLE_USER_EVENT.test(next.userEvent) &&
    next.timestamp - previous.timestamp < TEXT_HISTORY_GROUP_DELAY_MS &&
    changesAreAdjacent(previous.inverseChanges, next.inverseChanges)
  );
}

export function mergeEditorTextOperations(
  previous: EditorTextEditOperationEntry,
  next: EditorTextEditOperationEntry
): EditorTextEditOperationEntry {
  return {
    ...previous,
    afterContent: next.afterContent,
    afterSelection: next.afterSelection,
    forwardChanges: previous.forwardChanges.compose(next.forwardChanges),
    inverseChanges: next.inverseChanges.compose(previous.inverseChanges),
    timestamp: next.timestamp,
    userEvent: next.userEvent
  };
}
