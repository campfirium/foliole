import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { NativeWorkspaceReviewProfile } from '../../../../../lib/platform/nativeStorageContract';
import { digestEditorContent } from '../../../../features/editor/model/editorContentDigest';
import { getEditorOperationSession, invalidateEditorOperationSession, pushEditorOperationEntry,
  type EditorOperationHistoryState, type EditorTextEditOperationEntry } from '../../../../features/editor/model/editorOperationHistory';

import type { CompanionContentEdit } from './companionContentEditContract';
import { readCompanionEditHistoryFromDb, syntheticTextHistory, writeCompanionEditHistory } from './companionEditHistoryRepository';

export async function readCompanionHistoryReview(db: DbPort, nodeId: string) {
  const [row] = await db.query<NativeWorkspaceReviewProfile & Record<string, unknown>>(`SELECT due,
    difficulty, stability, state, reps, lapses, last_review_at AS lastReviewAt,
    elapsed_days AS elapsedDays, scheduled_days AS scheduledDays FROM node_review WHERE node_id = ?`, [nodeId]);
  return row ?? null;
}

export async function recordCompanionAnnotationHistory(db: DbPort, args: {
  documentId: string; before: WorkspaceNodeSnapshot | null; after: WorkspaceNodeSnapshot;
}) {
  const history = await readCompanionEditHistoryFromDb(db);
  const annotation = args.after;
  const next = args.before && !annotation.deletedAt
    ? pushTextHistory(history, args.documentId, args.before, annotation, 'content')
    : pushEditorOperationEntry(history, {
      nodeId: args.documentId, canonical: 'confirmed',
      ...(args.before ? { type: 'annotation.delete', title: 'Delete Annotation' } as const
        : { type: 'annotation.create', title: 'Create Annotation' } as const),
      annotations: [{ nodeId: annotation.id, parentNodeId: args.documentId,
        review: args.before?.review ?? annotation.review,
        kind: annotation.anchorLink?.kind === 'cloze' ? 'cloze' : 'highlight',
        ...(args.before?.currentVersionId ? { beforeVersionId: args.before.currentVersionId } : {}),
        ...(annotation.currentVersionId ? { afterVersionId: annotation.currentVersionId } : {}) }]
    });
  await writeCompanionEditHistory(db, history, next);
}

function pushTextHistory(history: EditorOperationHistoryState, documentId: string,
  before: WorkspaceNodeSnapshot, after: WorkspaceNodeSnapshot, field: 'content' | 'reveal',
  entries: readonly EditorTextEditOperationEntry[] = []) {
  const oldText = before[field] ?? '';
  const newText = after[field] ?? '';
  if (oldText === newText) return history;
  if (!before.currentVersionId || !after.currentVersionId) throw new Error('editor_history_version_unavailable');
  const candidates = entries.length && entries[0]?.beforeDigest === digestEditorContent(oldText) &&
    entries.at(-1)?.afterDigest === digestEditorContent(newText)
    ? entries : [syntheticTextHistory(documentId, oldText, newText)];
  let next = history;
  for (const entry of candidates) next = pushEditorOperationEntry(next, { ...entry, nodeId: documentId,
    target: { nodeId: after.id, field, beforeVersionId: before.currentVersionId, afterVersionId: after.currentVersionId } });
  return next;
}

function contentTransactions(args: { edit: CompanionContentEdit; before: WorkspaceNodeSnapshot; after: WorkspaceNodeSnapshot }) {
  const transactions = args.edit.historyTransactions ?? [];
  const fields = (['content', 'reveal'] as const).filter(field => args.before[field] !== args.after[field]);
  const recorded = new Set(fields.filter(field => {
    const entries = transactions.filter(change => change.field === field).flatMap(change => [...change.entries]);
    return entries.length && entries[0]?.beforeDigest === digestEditorContent(args.before[field] ?? '') &&
      entries.at(-1)?.afterDigest === digestEditorContent(args.after[field] ?? '') &&
      entries.every((entry, index) => !index || entry.beforeDigest === entries[index - 1]?.afterDigest);
  }));
  return [
    ...transactions.filter(change => recorded.has(change.field)),
    ...fields.filter(field => !recorded.has(field)).map(field => ({ field,
      entries: [syntheticTextHistory(args.after.id, args.before[field] ?? '', args.after[field] ?? '')] }))
  ];
}

export async function recordCompanionContentHistory(db: DbPort, args: {
  edit: CompanionContentEdit; before: WorkspaceNodeSnapshot; after: WorkspaceNodeSnapshot;
}) {
  const documentId = args.after.id;
  const before = await readCompanionEditHistoryFromDb(db);
  let after = before;
  const session = getEditorOperationSession(before, documentId);
  if (args.edit.baseContent !== undefined && args.edit.baseContent !== args.before.content &&
      (session.undoStack.length || session.redoStack.length)) {
    after = invalidateEditorOperationSession(after, { nodeId: documentId, reason: 'external-content-change' });
  }
  // A merged result can contain foreign edits; it must never become an undoable local replacement.
  if (args.before.currentVersionId === args.edit.baseVersionId && args.after.content === args.edit.content &&
      (args.edit.reveal === undefined || args.after.reveal === args.edit.reveal) &&
      (args.edit.baseContent === undefined || args.edit.baseContent === args.before.content)) {
    if (!args.before.currentVersionId || !args.after.currentVersionId) throw new Error('editor_history_version_unavailable');
    for (const { entries, field } of contentTransactions(args)) {
      for (const entry of entries) after = pushEditorOperationEntry(after, { ...entry, nodeId: documentId,
        target: { nodeId: documentId, field, beforeVersionId: args.before.currentVersionId, afterVersionId: args.after.currentVersionId } });
    }
  } else after = invalidateEditorOperationSession(after, { nodeId: documentId, reason: 'external-content-change' });
  await writeCompanionEditHistory(db, before, after);
}
