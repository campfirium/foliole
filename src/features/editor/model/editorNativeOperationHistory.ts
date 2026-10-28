import { EditorSelection, EditorState, Text, Transaction } from '@codemirror/state';

import type { EditorOperationHistoryEntry, EditorOperationHistoryState, EditorTextEditOperationEntry, EditorTextHistoryInput } from './editorOperationHistoryTypes';
import { findNativeTextHistory, isolateNativeTextHistory } from './nativeTextHistory';
import { nativeTextHistoryExtensions, nativeTextHistoryGroups, nativeTextHistoryInputFilter } from './nativeTextHistoryGroups';

export function editorTextTargetKey(nodeId: string, target?: { nodeId: string; field: 'content' | 'reveal' }) {
  return `${nodeId}\0${target?.nodeId ?? nodeId}\0${target?.field ?? 'content'}`;
}

export function editorHistorySelection(value: EditorTextHistoryInput['beforeSelection']) {
  return EditorSelection.create(value.ranges.map(range => EditorSelection.range(range.anchor, range.head)), value.mainIndex);
}

function recordProgrammaticInput(previous: EditorState | undefined, input: EditorTextHistoryInput, boundary: boolean) {
  if (!input.changes) throw new Error('editor_history_changes_unavailable');
  let state = previous && findNativeTextHistory(previous, input.beforeDoc.toString());
  if (!state) state = EditorState.create({ doc: input.beforeDoc, extensions: [
    EditorState.allowMultipleSelections.of(true), nativeTextHistoryExtensions, nativeTextHistoryInputFilter()
  ] });
  if (boundary || (previous && state !== previous)) state = isolateNativeTextHistory(state);
  const before = editorHistorySelection(input.beforeSelection);
  if (!state.selection.eq(before)) state = state.update({ selection: before, userEvent: 'select',
    annotations: Transaction.time.of(input.timestamp) }).state;
  return state.update({ changes: input.changes, selection: editorHistorySelection(input.afterSelection), userEvent: input.userEvent,
    annotations: Transaction.time.of(input.timestamp) }).state;
}

export function prepareNativeEditorTextEntry(history: EditorOperationHistoryState, input: EditorTextHistoryInput) {
  const key = editorTextTargetKey(input.nodeId, input.target);
  const previous = history.nativeTextStates[key];
  const top = history.sessionsByNodeId[input.nodeId]?.undoStack.at(-1);
  const boundary = Boolean(top && (top.type !== 'text.edit' || top.nativeTargetKey !== key));
  const state = input.nativeState ?? recordProgrammaticInput(previous, input, boundary);
  const groups = state.field(nativeTextHistoryGroups);
  const group = groups.undo.at(-1);
  if (!group) throw new Error('editor_history_native_group_unavailable');
  const before = previous?.field(nativeTextHistoryGroups);
  const continuous = input.nativeBefore && before && before.undo === input.nativeBefore.undo && before.redo === input.nativeBefore.redo;
  const entry: EditorTextEditOperationEntry = { type: 'text.edit', nodeId: input.nodeId, title: 'Edit Text',
    timestamp: input.timestamp, userEvent: input.userEvent, nativeGroup: group, nativeTargetKey: key,
    afterSelection: input.afterSelection,
    ...(input.target ? { target: input.target } : {}) };
  return { continuous: Boolean(continuous), entry, groups, key, state };
}

export function retainNativeTextEntries(stack: EditorOperationHistoryEntry[], key: string, groups: readonly object[]) {
  const valid = new Set(groups);
  return stack.filter(item => item.type !== 'text.edit' || item.nativeTargetKey !== key || valid.has(item.nativeGroup));
}

export function isolateDocumentTextHistory(history: EditorOperationHistoryState, nodeId: string) {
  return Object.fromEntries(Object.entries(history.nativeTextStates).map(([key, state]) =>
    [key, key.startsWith(`${nodeId}\0`) ? isolateNativeTextHistory(state) : state]));
}

export function retainNativeTextStates(history: EditorOperationHistoryState) {
  const keys = new Set(Object.values(history.sessionsByNodeId).flatMap(session =>
    [...(session?.undoStack ?? []), ...(session?.redoStack ?? [])].flatMap(entry =>
      entry.type === 'text.edit' ? [entry.nativeTargetKey] : [])));
  const states = Object.entries(history.nativeTextStates);
  // The two current text targets (body and answer) still own a native state after their last visible group is trimmed.
  for (const nodeId of history.recentNodeIds) {
    for (const [key] of states.filter(([key]) => key.startsWith(`${nodeId}\0`)).slice(-2)) keys.add(key);
  }
  return Object.fromEntries(states.filter(([key]) => keys.has(key)));
}

export function nativeTextInputDocuments(input: EditorTextHistoryInput) {
  return { before: input.beforeDoc, after: input.nativeState?.doc ?? input.changes!.apply(input.beforeDoc) };
}

export function nativeTextDocumentEquals(doc: Text, content: string) {
  return doc.eq(Text.of(content.split('\n')));
}

export function getEditorTextHistorySource(history: EditorOperationHistoryState, nodeId: string | null,
  target?: { nodeId: string; field: 'content' | 'reveal' }) {
  if (!nodeId) return null;
  const key = editorTextTargetKey(nodeId, target);
  const session = history.sessionsByNodeId[nodeId];
  const top = session?.undoStack.at(-1);
  return { state: history.nativeTextStates[key] ?? null,
    boundary: top?.type === 'text.edit' && top.nativeTargetKey !== key ? top : session?.textBoundary ?? null };
}

export function replaceNativeTextState(history: EditorOperationHistoryState, key: string, state: EditorState) {
  return Object.fromEntries([...Object.entries(history.nativeTextStates).filter(([existing]) => existing !== key), [key, state]]);
}
