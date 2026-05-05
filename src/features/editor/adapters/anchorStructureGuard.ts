import { Annotation, EditorState, type TransactionSpec } from '@codemirror/state';

import { parseAnchorBlocks } from '../model/anchorBlocks';

interface Range {
  from: number;
  to: number;
}

function collectProtectedTagRanges(content: string): Range[] {
  const parsed = parseAnchorBlocks(content);
  const ranges: Range[] = [];

  for (const block of parsed.blocks) {
    ranges.push({ from: block.openTagFrom, to: block.openTagTo });
    ranges.push({ from: block.closeTagFrom, to: block.closeTagTo });
  }

  for (const invalid of parsed.invalidTokens) {
    ranges.push({ from: invalid.from, to: invalid.to });
  }

  return ranges;
}

function touchesProtectedRange(change: Range, protectedRange: Range): boolean {
  const isInsertion = change.from === change.to;
  if (isInsertion) {
    return change.from > protectedRange.from && change.from < protectedRange.to;
  }
  return change.from < protectedRange.to && change.to > protectedRange.from;
}

export function shouldBlockAnchorTagMutation(content: string, changes: Range[]): boolean {
  if (changes.length === 0) {
    return false;
  }

  const protectedRanges = collectProtectedTagRanges(content);
  if (protectedRanges.length === 0) {
    return false;
  }

  return changes.some((change) => protectedRanges.some((protectedRange) => touchesProtectedRange(change, protectedRange)));
}

export const bypassAnchorStructureGuard = Annotation.define<boolean>();

export const anchorStructureGuard = EditorState.transactionFilter.of((transaction): TransactionSpec | readonly TransactionSpec[] => {
  if (!transaction.docChanged) {
    return transaction;
  }

  if (transaction.annotation(bypassAnchorStructureGuard)) {
    return transaction;
  }

  const changes: Range[] = [];
  transaction.changes.iterChangedRanges((fromA, toA) => {
    changes.push({ from: fromA, to: toA });
  });

  const content = transaction.startState.doc.toString();
  if (shouldBlockAnchorTagMutation(content, changes)) {
    return [];
  }

  return transaction;
});
