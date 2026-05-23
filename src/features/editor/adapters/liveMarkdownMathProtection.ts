import { EditorState, type Transaction } from '@codemirror/state';

import { collectMarkdownMathRanges } from '../model/markdownMathRanges';

import { getEditedMathRange, isEditedMathRange } from './liveMarkdownMathEditState';

function isCollapsedSelectionOutsideRange(transaction: Transaction, from: number, to: number) {
  return transaction.startState.selection.ranges.every((range) => {
    if (!range.empty) return false;
    return range.head <= from || range.head >= to;
  });
}

function deletesUneditedMathRangeFromOutside(transaction: Transaction) {
  if (!transaction.docChanged) return false;

  const source = transaction.startState.doc.toString();
  const editedMathRange = getEditedMathRange(transaction.startState);
  const mathRanges = collectMarkdownMathRanges(source);
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

function changesBlockMathClosingBoundaryFromOutside(transaction: Transaction) {
  if (!transaction.docChanged) return false;

  const source = transaction.startState.doc.toString();
  const editedMathRange = getEditedMathRange(transaction.startState);
  const mathRanges = collectMarkdownMathRanges(source);
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
  return deletesUneditedMathRangeFromOutside(transaction) || changesBlockMathClosingBoundaryFromOutside(transaction)
    ? []
    : transaction;
});
