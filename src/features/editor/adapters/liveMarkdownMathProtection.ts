import { EditorState, type Transaction } from '@codemirror/state';

import { collectMarkdownMathRanges } from '../model/markdownMathRanges';

import { getEditedMathRange, isEditedMathRange } from './liveMarkdownMathEditState';

function isCollapsedSelectionOutsideRange(transaction: Transaction, from: number, to: number) {
  return transaction.startState.selection.ranges.every((range) => {
    if (!range.empty) return false;
    return range.head <= from || range.head >= to;
  });
}

function deletesUneditedMathRangeFromOutside(transaction: Transaction, mathRanges: ReturnType<typeof collectMarkdownMathRanges>) {
  if (!transaction.docChanged) return false;

  const editedMathRange = getEditedMathRange(transaction.startState);
  let deletesMathRange = false;

  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (deletesMathRange || inserted.length > 0) return;
    for (const mathRange of mathRanges) {
      if (isEditedMathRange(editedMathRange, mathRange.from, mathRange.to)) continue;
      if (fromA <= mathRange.from && toA >= mathRange.to && isCollapsedSelectionOutsideRange(transaction, mathRange.from, mathRange.to)) {
        deletesMathRange = true;
        return;
      }
    }
  });

  return deletesMathRange;
}

function changesBlockMathClosingBoundaryFromOutside(transaction: Transaction, mathRanges: ReturnType<typeof collectMarkdownMathRanges>) {
  if (!transaction.docChanged) return false;

  const editedMathRange = getEditedMathRange(transaction.startState);
  let changesClosingBoundary = false;

  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (changesClosingBoundary) return;
    for (const mathRange of mathRanges) {
      if (mathRange.display !== 'block' || isEditedMathRange(editedMathRange, mathRange.from, mathRange.to)) continue;
      if (!isCollapsedSelectionOutsideRange(transaction, mathRange.from, mathRange.to)) continue;
      if (fromA === mathRange.to && (toA > fromA || !inserted.toString().startsWith('\n'))) {
        changesClosingBoundary = true;
        return;
      }
    }
  });

  return changesClosingBoundary;
}

export const protectCollapsedMathDeletion = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.docChanged) return transaction;
  const mathRanges = collectMarkdownMathRanges(transaction.startState.doc.toString());
  return deletesUneditedMathRangeFromOutside(transaction, mathRanges) || changesBlockMathClosingBoundaryFromOutside(transaction, mathRanges)
    ? []
    : transaction;
});
