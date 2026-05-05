import { StateField, type ChangeDesc, type EditorState, type Text } from '@codemirror/state';

import { CODE_FENCE_PATTERN } from './liveMarkdownPrimitives';

export const codeFenceLineNumbersField = StateField.define<readonly number[]>({
  create(state) {
    return collectCodeFenceLineNumbers(state.doc);
  },
  update(value, transaction) {
    if (!transaction.docChanged) return value;
    return updateCodeFenceLineNumbers(value, transaction.startState.doc, transaction.state.doc, transaction.changes);
  }
});

export function collectCodeFenceLineNumbers(doc: Text) {
  const fenceLineNumbers: number[] = [];

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    if (CODE_FENCE_PATTERN.test(doc.line(lineNumber).text)) {
      fenceLineNumbers.push(lineNumber);
    }
  }

  return fenceLineNumbers;
}

export function updateCodeFenceLineNumbers(
  previousLineNumbers: readonly number[],
  oldDoc: Text,
  newDoc: Text,
  changes: ChangeDesc
) {
  const changedStartLine = resolveChangedStartLine(oldDoc, changes);
  const nextLineNumbers = previousLineNumbers.filter((lineNumber) => lineNumber < changedStartLine);

  for (let lineNumber = changedStartLine; lineNumber <= newDoc.lines; lineNumber += 1) {
    if (CODE_FENCE_PATTERN.test(newDoc.line(lineNumber).text)) {
      nextLineNumbers.push(lineNumber);
    }
  }

  return nextLineNumbers;
}

export function resolveCodeBlockStateBeforeLine(state: EditorState, lineNumber: number) {
  return countFenceLinesBeforeLine(state.field(codeFenceLineNumbersField), lineNumber) % 2 === 1;
}

function countFenceLinesBeforeLine(lineNumbers: readonly number[], lineNumber: number) {
  let low = 0;
  let high = lineNumbers.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((lineNumbers[mid] ?? 0) < lineNumber) low = mid + 1;
    else high = mid;
  }

  return low;
}

function resolveChangedStartLine(oldDoc: Text, changes: ChangeDesc) {
  let changedStartLine = oldDoc.lines;

  changes.iterChangedRanges((fromA) => {
    changedStartLine = Math.min(changedStartLine, oldDoc.lineAt(fromA).number);
  });

  return changedStartLine;
}
