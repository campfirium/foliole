import { StateEffect, StateField, type EditorState } from '@codemirror/state';

export interface EditedMathRange {
  from: number;
  to: number;
}

export const setEditedMathRangeEffect = StateEffect.define<EditedMathRange | null>();

export const editedMathRangeField = StateField.define<EditedMathRange | null>({
  create: () => null,
  update(value, transaction) {
    let next = value
      ? { from: transaction.changes.mapPos(value.from), to: transaction.changes.mapPos(value.to) }
      : null;
    for (const effect of transaction.effects) {
      if (effect.is(setEditedMathRangeEffect)) next = effect.value;
    }
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
