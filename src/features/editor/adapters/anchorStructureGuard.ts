import { Annotation, EditorState, Transaction, type TransactionSpec } from '@codemirror/state';

import { parseAnchorBlocks } from '../model/anchorBlocks';

import { recoverAnchorMutation } from './anchorMutationRecovery';

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

  const changes: Array<Range & { insert: string }> = [];
  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    changes.push({ from: fromA, insert: inserted.toString(), to: toA });
  });

  const content = transaction.startState.doc.toString();
  const recovered = recoverAnchorMutation({
    changes,
    content,
    nextContent: transaction.newDoc.toString(),
    selection: transaction.newSelection
  });
  if (recovered) {
    const userEvent = transaction.annotation(Transaction.userEvent);
    return {
      annotations: [
        bypassAnchorStructureGuard.of(true),
        ...(userEvent ? [Transaction.userEvent.of(userEvent)] : [])
      ],
      changes: { from: 0, to: content.length, insert: recovered.content },
      filter: false,
      scrollIntoView: transaction.scrollIntoView,
      selection: recovered.selection
    };
  }

  if (shouldBlockAnchorTagMutation(content, changes)) {
    return [];
  }

  return transaction;
});
