import { StateEffect, StateField, type EditorState } from '@codemirror/state';

export interface EditedMathRange {
  from: number;
  to: number;
}

export const setEditedMathRangeEffect = StateEffect.define<EditedMathRange | null>();

function normalizeEditedMathRange(value: EditedMathRange | null, docLength: number): EditedMathRange | null {
  if (!value || !Number.isInteger(value.from) || !Number.isInteger(value.to) || value.from >= value.to) {
    return null;
  }
  const from = Math.max(0, Math.min(value.from, docLength));
  const to = Math.max(0, Math.min(value.to, docLength));
  return from < to ? { from, to } : null;
}

export const editedMathRangeField = StateField.define<EditedMathRange | null>({
  create: () => null,
  update(value, transaction) {
    const current = normalizeEditedMathRange(value, transaction.startState.doc.length);
    let next = current
      ? { from: transaction.changes.mapPos(current.from), to: transaction.changes.mapPos(current.to) }
      : null;
    for (const effect of transaction.effects) {
      if (effect.is(setEditedMathRangeEffect)) {
        next = normalizeEditedMathRange(effect.value, transaction.newDoc.length);
      }
    }
    next = normalizeEditedMathRange(next, transaction.newDoc.length);
    if (next && transaction.selection) {
      const head = transaction.selection.main.head;
      if (head < next.from || head > next.to) next = null;
    }
    return next;
  }
});

export function getEditedMathRange(state: EditorState) {
  return state.field(editedMathRangeField, false) ?? null;
}

export function isSameEditedMathRange(left: EditedMathRange | null, right: EditedMathRange | null) {
  return left?.from === right?.from && left?.to === right?.to;
}

export function isEditedMathRange(range: EditedMathRange | null, from: number, to: number) {
  return range?.from === from && range.to === to;
}
