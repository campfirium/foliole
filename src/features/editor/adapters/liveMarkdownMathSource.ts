import type { Range, Text } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

import type { MarkdownMathRange } from '../model/markdownMathExtension';

import { addMark } from './liveMarkdownPrimitives';

const TOKEN_PATTERNS: Array<[RegExp, string]> = [
  [/\\[A-Za-z]+|\\./g, 'cm-md-math-source-command'],
  [/[{}[\]()]/g, 'cm-md-math-source-bracket'],
  [/[0-9]+(?:\.[0-9]+)?/g, 'cm-md-math-source-number'],
  [/[=+\-*/^_]/g, 'cm-md-math-source-operator']
];

function addMathSourceLineClasses(ranges: Range<Decoration>[], doc: Text, mathRange: MarkdownMathRange) {
  const startLine = doc.lineAt(mathRange.from);
  const endLine = doc.lineAt(Math.max(mathRange.from, mathRange.to - 1));
  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    ranges.push(Decoration.line({ attributes: { class: 'cm-line-math-source' } }).range(doc.line(lineNumber).from));
  }
}

function addTokenMarks(ranges: Range<Decoration>[], tex: string, texFrom: number) {
  for (const [pattern, className] of TOKEN_PATTERNS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(tex); match; match = pattern.exec(tex)) {
      addMark(ranges, texFrom + match.index, texFrom + match.index + match[0].length, className);
    }
  }
}

export function addEditedMathSourceDecorations(
  ranges: Range<Decoration>[],
  doc: Text,
  mathRange: MarkdownMathRange
) {
  addMathSourceLineClasses(ranges, doc, mathRange);
  addMark(ranges, mathRange.from, mathRange.to, 'cm-md-math-source-shell');
  addMark(ranges, mathRange.from, mathRange.texFrom, 'cm-md-math-source-delimiter');
  addMark(ranges, mathRange.texFrom, mathRange.texTo, 'cm-md-math-source-code');
  addMark(ranges, mathRange.texTo, mathRange.to, 'cm-md-math-source-delimiter');
  addTokenMarks(ranges, doc.sliceString(mathRange.texFrom, mathRange.texTo), mathRange.texFrom);
}
