import { EditorState, StateField, type Text, type Transaction } from '@codemirror/state';

import { TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../../../../lib/core/nodes/textBodyBudget';

interface ChangedWindow {
  oldFrom: number;
  oldTo: number;
  newFrom: number;
  newTo: number;
}

function changedWindows(transaction: Transaction) {
  const windows: ChangedWindow[] = [];
  transaction.changes.iterChanges((fromA, toA, fromB, toB) => {
    const next = {
      oldFrom: Math.max(0, fromA - 1), oldTo: Math.min(transaction.startState.doc.length, toA + 1),
      newFrom: Math.max(0, fromB - 1), newTo: Math.min(transaction.newDoc.length, toB + 1)
    };
    const previous = windows.at(-1);
    if (previous && (next.oldFrom <= previous.oldTo || next.newFrom <= previous.newTo)) {
      previous.oldTo = next.oldTo;
      previous.newTo = next.newTo;
    } else windows.push(next);
  });
  return windows;
}

function windowBytes(doc: Text, from: number, to: number) {
  return utf8ByteLength(doc.sliceString(from, to));
}

export function changedBodyBytes(currentBytes: number, transaction: Transaction) {
  let bytes = currentBytes;
  for (const window of changedWindows(transaction)) {
    bytes -= windowBytes(transaction.startState.doc, window.oldFrom, window.oldTo);
    bytes += windowBytes(transaction.newDoc, window.newFrom, window.newTo);
  }
  return bytes;
}

export function createBodyBudgetExtension(onOverflow: (transaction: Transaction) => void,
  enabled: () => boolean = () => true) {
  const bodyBytes = StateField.define({
    create: (state) => utf8ByteLength(state.doc.toString()),
    update: (bytes, transaction) => transaction.docChanged ? changedBodyBytes(bytes, transaction) : bytes
  });
  return [bodyBytes, EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged || !enabled()) {
      return transaction;
    }
    const previousBytes = transaction.startState.field(bodyBytes);
    const nextBytes = changedBodyBytes(previousBytes, transaction);
    if (nextBytes <= TEXT_BODY_MAX_BYTES || nextBytes < previousBytes) return transaction;
    onOverflow(transaction);
    return [];
  })];
}
