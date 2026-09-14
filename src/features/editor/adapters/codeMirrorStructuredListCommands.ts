import { indentUnit, syntaxTree } from '@codemirror/language';
import type { ChangeSpec, EditorState } from '@codemirror/state';
import type { Command, EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

export interface ListTarget {
  contentFrom: number;
  indentFrom: number;
  lineFrom: number;
  listMarkFrom: number;
  listMarkTo: number;
  taskMarkFrom?: number;
  taskMarkTo?: number;
  taskState?: 'checked' | 'unchecked';
}

export const STRUCTURED_LIST_EVENT = 'input.list';

function directChild(node: SyntaxNode, name: string) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function descendant(node: SyntaxNode, name: string): SyntaxNode | null {
  if (node.name === name) return node;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const match = descendant(child, name);
    if (match) return match;
  }
  return null;
}

function extendSpaces(state: EditorState, position: number, limit: number) {
  while (position < limit && /[\t ]/.test(state.sliceDoc(position, position + 1))) position += 1;
  return position;
}

function quoteContentStart(state: EditorState, lineFrom: number, listMarkFrom: number) {
  let contentFrom = lineFrom;
  syntaxTree(state).iterate({
    from: lineFrom,
    to: listMarkFrom,
    enter: ({ name, to }) => {
      if (name !== 'QuoteMark') return;
      const separator = state.sliceDoc(to, to + 1);
      contentFrom = /[\t ]/.test(separator) ? to + 1 : to;
    }
  });
  return contentFrom;
}

function createListTarget(state: EditorState, node: SyntaxNode): ListTarget | null {
  const listMark = directChild(node, 'ListMark');
  if (!listMark) return null;
  const line = state.doc.lineAt(listMark.from);
  const nestedTaskMark = descendant(node, 'TaskMarker');
  const taskMark = nestedTaskMark && state.doc.lineAt(nestedTaskMark.from).from === line.from ? nestedTaskMark : null;
  const prefixEnd = taskMark?.to ?? listMark.to;
  const markerText = taskMark ? state.sliceDoc(taskMark.from, taskMark.to) : '';
  return {
    contentFrom: extendSpaces(state, prefixEnd, line.to),
    indentFrom: quoteContentStart(state, line.from, listMark.from),
    lineFrom: line.from,
    listMarkFrom: listMark.from,
    listMarkTo: listMark.to,
    ...(taskMark ? {
      taskMarkFrom: taskMark.from,
      taskMarkTo: taskMark.to,
      taskState: /x/i.test(markerText) ? 'checked' as const : 'unchecked' as const
    } : {})
  };
}

export function collectListTargets(state: EditorState) {
  const targets = new Map<number, ListTarget>();
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'ListItem') return;
      const target = createListTarget(state, node.node);
      if (target) targets.set(target.lineFrom, target);
    }
  });
  return targets;
}

export function selectedLineStarts(state: EditorState) {
  const starts = new Set<number>();
  for (const range of state.selection.ranges) {
    const finalPosition = range.to > range.from && state.doc.lineAt(range.to).from === range.to ? range.to - 1 : range.to;
    const firstLine = state.doc.lineAt(range.from).number;
    const lastLine = state.doc.lineAt(Math.max(range.from, finalPosition)).number;
    for (let number = firstLine; number <= lastLine; number += 1) starts.add(state.doc.line(number).from);
  }
  return [...starts].sort((left, right) => left - right);
}

function selectedListTargets(state: EditorState) {
  const targets = collectListTargets(state);
  const selected = selectedLineStarts(state).map((from) => targets.get(from));
  return selected.every((target): target is ListTarget => target !== undefined) ? selected : null;
}

export function dispatchStructuredListChanges(view: EditorView, changes: readonly ChangeSpec[]) {
  if (changes.length === 0) return false;
  view.dispatch({ changes, userEvent: STRUCTURED_LIST_EVENT });
  return true;
}

function removeIndentChange(state: EditorState, target: ListTarget): ChangeSpec | null {
  const indentation = state.sliceDoc(target.indentFrom, target.listMarkFrom);
  if (!indentation || !/^[\t ]+$/.test(indentation)) return null;
  const unit = state.facet(indentUnit);
  const removeLength = indentation.endsWith(unit) ? unit.length : Math.min(unit.length, indentation.length);
  return { from: target.listMarkFrom - removeLength, to: target.listMarkFrom };
}

export function runListIndent(view: EditorView, outdent: boolean) {
  const targets = selectedListTargets(view.state);
  if (!targets) return false;
  if (view.composing) return true;
  if (view.state.readOnly) return false;
  const changes = outdent
    ? targets.map((target) => removeIndentChange(view.state, target)).filter((change): change is ChangeSpec => change !== null)
    : targets.map((target) => ({ from: target.listMarkFrom, insert: view.state.facet(indentUnit) }));
  dispatchStructuredListChanges(view, changes);
  return true;
}

function isEmptyListTarget(state: EditorState, target: ListTarget) {
  return state.sliceDoc(target.contentFrom, state.doc.lineAt(target.lineFrom).to).trim().length === 0;
}

export const continueOrExitEmptyList: Command = (view) => {
  if (view.state.selection.ranges.some((range) => !range.empty)) return false;
  const targets = selectedListTargets(view.state);
  if (!targets || targets.some((target) => !isEmptyListTarget(view.state, target))) return false;
  if (view.composing) return true;
  if (view.state.readOnly) return false;
  const changes = targets.map((target) => removeIndentChange(view.state, target) ?? {
    from: target.listMarkFrom,
    to: target.contentFrom
  });
  return dispatchStructuredListChanges(view, changes);
};
