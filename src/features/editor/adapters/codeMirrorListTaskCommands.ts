import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type ChangeSpec, type EditorState } from '@codemirror/state';
import type { Command, EditorView } from '@codemirror/view';

import {
  STRUCTURED_LIST_EVENT,
  collectListTargets,
  dispatchStructuredListChanges,
  selectedLineStarts,
  type ListTarget
} from './codeMirrorStructuredListCommands';

type CycleState = 'bullet' | 'checked' | 'plain' | 'unchecked';

const PROTECTED_BLOCKS = new Set(['CodeBlock', 'FencedCode', 'Frontmatter']);

function collectProtectedLines(state: EditorState) {
  const protectedLines = new Set<number>();
  syntaxTree(state).iterate({
    enter: ({ name, from, to }) => {
      if (!PROTECTED_BLOCKS.has(name)) return;
      const first = state.doc.lineAt(from).number;
      const last = state.doc.lineAt(Math.max(from, to - 1)).number;
      for (let number = first; number <= last; number += 1) protectedLines.add(state.doc.line(number).from);
    }
  });
  return protectedLines;
}

function cycleState(target: ListTarget | undefined): CycleState {
  if (!target) return 'plain';
  return target.taskState ?? 'bullet';
}

function nextCycleState(states: readonly CycleState[]): CycleState {
  if (states.includes('plain')) return 'bullet';
  if (states.includes('bullet')) return 'unchecked';
  if (states.includes('unchecked')) return 'checked';
  return 'bullet';
}

function cycleChange(target: ListTarget | undefined, lineFrom: number, next: CycleState): ChangeSpec | null {
  if (!target) return next === 'bullet' ? { from: lineFrom, insert: '- ' } : null;
  if (next === 'bullet') {
    return target.taskMarkFrom === undefined ? null : { from: target.taskMarkFrom, to: target.contentFrom };
  }
  if (next === 'unchecked' && target.taskMarkFrom === undefined) {
    return { from: target.listMarkTo, insert: ' [ ]' };
  }
  if (target.taskMarkFrom === undefined || target.taskMarkTo === undefined) return null;
  return { from: target.taskMarkFrom, to: target.taskMarkTo, insert: next === 'checked' ? '[x]' : '[ ]' };
}

function plainListInsertionFrom(state: EditorState, lineFrom: number) {
  const line = state.doc.lineAt(lineFrom);
  let insertionFrom = line.from;
  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter: ({ name, to }) => {
      if (name !== 'QuoteMark') return;
      insertionFrom = /[\t ]/.test(state.sliceDoc(to, to + 1)) ? to + 1 : to;
    }
  });
  return insertionFrom;
}

export const cycleListTask: Command = (view) => {
  const lines = selectedLineStarts(view.state);
  const protectedLines = collectProtectedLines(view.state);
  if (lines.some((from) => protectedLines.has(from))) return false;
  if (view.composing) return true;
  if (view.state.readOnly) return false;
  const targets = collectListTargets(view.state);
  const next = nextCycleState(lines.map((from) => cycleState(targets.get(from))));
  const changes = lines.map((from) => {
    const target = targets.get(from);
    return cycleChange(target, target ? from : plainListInsertionFrom(view.state, from), next);
  }).filter((change): change is ChangeSpec => change !== null);
  return dispatchStructuredListChanges(view, changes);
};

export function toggleTaskMarkerAt(view: EditorView, from: number, to: number) {
  if (view.state.readOnly || view.composing) return false;
  const marker = view.state.sliceDoc(from, to);
  if (!/^\[[ xX]\]$/.test(marker)) return false;
  const insert = /x/i.test(marker) ? '[ ]' : '[x]';
  const selection = EditorSelection.fromJSON(view.state.selection.toJSON());
  view.dispatch({ changes: { from, to, insert }, selection, userEvent: STRUCTURED_LIST_EVENT });
  view.focus();
  return true;
}
