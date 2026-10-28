import { Text } from '@codemirror/state';

import { parseStoredAnchorLink } from '../../../../../lib/core/database/anchorLinkCodec';
import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { contentImageReferences } from '../../../../../lib/core/sync/localContentEditResources';
import { createOpaqueVersionRef } from '../../../../../lib/core/sync/opaqueSyncRefs';
import { loadRetainedSyncNodeVersionFact } from '../../../../../lib/core/sync/syncNodeGraph';
import { digestEditorContent } from '../../../../features/editor/model/editorContentDigest';
import { getEditorOperationTopEntry, moveEditorOperationEntry, replaceEditorOperationEntry,
  type EditorAnnotationOperationEntry, type EditorTextEditOperationEntry } from '../../../../features/editor/model/editorOperationHistory';
import { applyCompanionSyncNodeVersionsWithDbPort } from '../../companionSyncNodeVersions';
import { createCompanionUuid } from '../../companionUuid';
import { getCompanionReadingScope } from '../reading/companionReadingScope';
import { writeIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from '../runtime/iosCompanionMutationState';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { saveCompanionContentEditWithDb } from './companionContentEditing';
import { readCompanionHistoryReview } from './companionEditHistoryRecording';
import { readCompanionEditHistoryFromDb, writeCompanionEditHistory } from './companionEditHistoryRepository';

type Mode = 'undo' | 'redo';

export function applyCompanionEditHistory(documentId: string, mode: Mode) {
  const owner = getIosCompanionDatabaseOwner();
  const scope = getCompanionReadingScope();
  return runCompanionHighValueMutationTask(() => {
    if (getIosCompanionDatabaseOwner() !== owner || getCompanionReadingScope() !== scope) {
      throw new Error('editor_history_context_changed');
    }
    return writeIosCompanionDatabase(db => db.transaction(async tx => {
      const history = await readCompanionEditHistoryFromDb(tx);
      const entry = getEditorOperationTopEntry(history, documentId, mode);
      if (!entry) return false;
      const document = await loadCompanionWorkspaceNodeFromDb(tx, documentId);
      if (!document || document.deletedAt) throw new Error('editor_history_unavailable');
      let updated = history;
      const result = entry.type === 'text.edit' ? await replayText(tx, entry, mode) : null;
      if (entry.type !== 'text.edit') updated = replaceEditorOperationEntry(history, documentId, mode, await replayAnnotations(tx, entry, mode));
      await writeCompanionEditHistory(tx, history, moveEditorOperationEntry(updated, documentId, mode));
      return result ?? { nodeId: documentId, versionId: document.currentVersionId ?? '' };
    }));
  }, { kind: 'full' });
}

async function replayText(db: DbPort, entry: EditorTextEditOperationEntry, mode: Mode) {
  const target = entry.target;
  if (!target) throw new Error('editor_history_target_unavailable');
  const current = await loadCompanionWorkspaceNodeFromDb(db, target.nodeId);
  if (!current?.currentVersionId || current.deletedAt) throw new Error('editor_history_unavailable');
  const text = current[target.field] ?? '';
  if (digestEditorContent(text) !== (mode === 'undo' ? entry.afterDigest : entry.beforeDigest)) {
    throw new Error('editor_history_content_changed');
  }
  const version = await loadRetainedSyncNodeVersionFact(db, mode === 'undo' ? target.beforeVersionId : target.afterVersionId);
  if (!version) throw new Error('editor_history_version_unavailable');
  const next = (mode === 'undo' ? entry.inverseChanges : entry.forwardChanges).apply(Text.of(text.split('\n'))).toString();
  const saved = await saveCompanionContentEditWithDb(db, { nodeId: current.id, baseContent: current.content,
    baseVersionId: current.currentVersionId, versionId: createOpaqueVersionRef(createCompanionUuid()),
    content: target.field === 'content' ? next : current.content,
    ...(target.field === 'reveal' ? { reveal: next === '' && version.snapshot.reveal === null ? null : next } : {}),
    newImageReferences: contentImageReferences(version),
    updatedAt: new Date().toISOString() }, false);
  return { nodeId: current.id, versionId: saved.currentVersionId };
}

async function replayAnnotations(db: DbPort, entry: EditorAnnotationOperationEntry, mode: Mode) {
  const trash = (entry.type === 'annotation.create') === (mode === 'undo');
  const hostName = await iosCompanionHostName(db);
  const versions = [];
  const annotations = [];
  for (const annotation of entry.annotations) {
    const current = await loadCompanionWorkspaceNodeFromDb(db, annotation.nodeId);
    if (!current?.currentVersionId || current.parentNodeId !== annotation.parentNodeId || Boolean(current.deletedAt) === trash) {
      throw new Error('editor_history_annotation_changed');
    }
    const liveVersionId = entry.type === 'annotation.create' ? annotation.afterVersionId : annotation.beforeVersionId;
    const original = liveVersionId ? await loadRetainedSyncNodeVersionFact(db, liveVersionId) : null;
    if (!original) throw new Error('editor_history_annotation_version_unavailable');
    if (digestEditorContent(current.content) !== digestEditorContent(original.body_text ?? '')) {
      throw new Error('editor_history_annotation_content_changed');
    }
    if (current.reveal !== (original.snapshot.reveal ?? null)) throw new Error('editor_history_annotation_answer_changed');
    if (JSON.stringify(current.anchorLink ?? null) !== JSON.stringify(parseStoredAnchorLink(original.snapshot.anchor_link))) {
      throw new Error('editor_history_annotation_anchor_changed');
    }
    const [child] = await db.query('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL LIMIT 1', [current.id]);
    if (trash && child) throw new Error('editor_history_annotation_has_children');
    const now = new Date().toISOString();
    versions.push(await toWorkspaceNativeNodeVersion({ ...current, deletedAt: trash ? now : null, updatedAt: now }, hostName));
    annotations.push({ ...annotation, review: (trash ? await readCompanionHistoryReview(db, current.id) : annotation.review) ?? null });
  }
  const ids = await applyCompanionSyncNodeVersionsWithDbPort(db, versions, trash ? 'local_mutation' : 'local_restore');
  if (ids.length !== versions.length) throw new Error('editor_history_not_applied');
  return { ...entry, annotations };
}
