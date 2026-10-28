import type { EditorTextHistoryInput } from '../../../../features/editor/model/editorOperationHistory';

import type { CompanionContentSaveHandler } from './companionContentEditContract';
import { ContentDraftNativeHistory } from './contentDraftNativeHistory';

type Field = 'content' | 'reveal';
export type ContentHistoryTransactions = { field: Field; entries: readonly EditorTextHistoryInput[] }
  | { field: Field; readEntries: () => readonly EditorTextHistoryInput[] };

export class ContentDraftHistory {
  private changes: { sequence: number; field: Field; entries?: readonly EditorTextHistoryInput[]; native?: ContentDraftNativeHistory }[] = [];
  private buffered: Partial<Record<Field, ContentDraftNativeHistory>> = {};
  private currentField: Field | null = null;
  private currentBoundary = {};
  private nextBoundary = { content: {}, reveal: {} };
  private boundaries = new Map<Field, { external: object | null; local: object; token: object }>();

  admitField(field: Field) {
    if (this.currentField === field) return;
    this.currentField = field;
    this.currentBoundary = this.nextBoundary[field];
    this.nextBoundary[field === 'content' ? 'reveal' : 'content'] = {};
  }

  source(save: CompanionContentSaveHandler, nodeId: string | null, field: Field) {
    const source = save.historySource?.(nodeId, field);
    if (!source) return null;
    const local = this.currentField === field ? this.currentBoundary : this.nextBoundary[field];
    let boundary = this.boundaries.get(field);
    if (!boundary || boundary.external !== source.boundary || boundary.local !== local) {
      boundary = { external: source.boundary, local, token: {} };
      this.boundaries.set(field, boundary);
    }
    return { ...source, boundary: boundary.token };
  }

  buffer(field: Field, entries: readonly EditorTextHistoryInput[] = []) {
    for (const input of entries) {
      const batch = this.buffered[field];
      if (batch) batch.add(input);
      else this.buffered[field] = new ContentDraftNativeHistory(input);
    }
  }

  discard(field: Field) {
    delete this.buffered[field];
    if (field === this.currentField) this.currentBoundary = {};
    else this.nextBoundary[field] = {};
  }

  record(sequence: number, field: Field, entries?: readonly EditorTextHistoryInput[]) {
    const native = this.buffered[field];
    delete this.buffered[field];
    if (native) this.changes.push({ sequence, field, native });
    else if (entries?.length) this.changes.push({ sequence, field, entries });
  }

  through(sequence: number): ContentHistoryTransactions[] {
    return this.changes.filter(change => change.sequence <= sequence).map(change => {
      const native = change.native;
      return native ? { field: change.field, readEntries: () => native.inputs() }
        : { field: change.field, entries: change.entries ?? [] };
    });
  }

  acknowledge(sequence: number) {
    this.changes = this.changes.filter(change => change.sequence > sequence);
  }
}
