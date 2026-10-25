import type { EditorTextEditOperationEntry } from '../../../../features/editor/model/editorOperationHistory';

export interface ContentHistoryTransactions {
  entries: readonly EditorTextEditOperationEntry[];
  field: 'content' | 'reveal';
}

export class ContentDraftHistory {
  private changes: (ContentHistoryTransactions & { sequence: number })[] = [];

  record(sequence: number, field: 'content' | 'reveal', entries?: readonly EditorTextEditOperationEntry[]) {
    if (entries?.length) this.changes.push({ sequence, field, entries });
  }

  through(sequence: number) {
    return this.changes.filter(change => change.sequence <= sequence);
  }

  acknowledge(sequence: number) {
    this.changes = this.changes.filter(change => change.sequence > sequence);
  }
}
