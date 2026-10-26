import { parseStoredAnchorLink } from '../../../../../lib/core/database/anchorLinkCodec';
import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { applyLocalContentEdit } from '../../../../../lib/core/sync/localContentEdit';
import { contentImageReferences } from '../../../../../lib/core/sync/localContentEditResources';
import { releaseLocalEditBase, retainLocalEditBase } from '../../../../../lib/core/sync/nodeVersionLocalEditHold';
import { collectNodeVersionPayloads } from '../../../../../lib/core/sync/nodeVersionPayloadCollector';
import { loadCurrentSyncNodeRecord, loadRetainedSyncNodeVersionFact } from '../../../../../lib/core/sync/syncNodeGraph';
import { resolveNodeDerivedTitle } from '../../../../features/nodes/model/nodeDerivedTitle';
import { assertNodeTextForSave } from '../../../ui/nodeTextSaveBudget';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { isNativeCompanionNodeVersionWriteRuntime } from '../../companionWorkspaceRuntimeRepository';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { iosCompanionHostName } from '../runtime/iosCompanionMutationState';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { readCompanionContentAnchors, remapCompanionContentAnchors } from './companionContentAnchorRemap';
import type { CompanionContentEdit, CompanionContentSource } from './companionContentEditContract';
import { recordCompanionContentHistory } from './companionEditHistoryRecording';

export async function readCompanionContentSource(nodeId: string, holdId?: string): Promise<CompanionContentSource> {
  const read = async (db: DbPort) => {
    await requireEditableContentNode(db, nodeId);
    const current = await loadCurrentSyncNodeRecord(db, nodeId, false);
    if (!current?.version_id || current.snapshot.deleted_at) throw new Error('content_edit_node_unavailable');
    if (holdId) await retainLocalEditBase(db, { holdId, nodeId, versionId: current.version_id });
    return { ...(current.snapshot.kind === 'item' ? { reveal: current.snapshot.reveal ?? null } : {}),
      content: current.body_text ?? '', imageReferences: contentImageReferences(current), versionId: current.version_id };
  };
  return holdId
    ? runCompanionSyncWriterTask(() => writeIosCompanionDatabase((db) => db.transaction(read)))
    : readIosCompanionDatabase(read);
}

export async function retainCompanionContentBase(nodeId: string, versionId: string, holdId: string) {
  return runCompanionSyncWriterTask(() => writeIosCompanionDatabase((db) => db.transaction((tx) =>
    retainLocalEditBase(tx, { holdId, nodeId, versionId })
  )));
}

export async function releaseCompanionContentBase(nodeId: string, holdId: string) {
  return runCompanionSyncWriterTask(() => writeIosCompanionDatabase((db) =>
    releaseLocalEditBase(db, holdId, nodeId)
  ));
}

export async function saveCompanionContentEdit(edit: CompanionContentEdit) {
  if (!isNativeCompanionNodeVersionWriteRuntime()) throw new Error('content_edit_runtime_unavailable');
  const result = await runCompanionHighValueMutationTask(() =>
    writeIosCompanionDatabase((port) => port.transaction(db => saveCompanionContentEditWithDb(db, edit))),
    { kind: 'nodes', nodeIds: [edit.nodeId] });
  await runCompanionSyncWriterTask(() =>
    writeIosCompanionDatabase((db) => collectNodeVersionPayloads(db, edit.nodeId, 32)))
    .catch((error: unknown) => { console.warn('[node-version-retention] local collection failed', error); });
  return result;
}

export async function saveCompanionContentEditWithDb(db: DbPort, edit: CompanionContentEdit, recordHistory = true) {
  const [alreadySubmitted] = await db.query('SELECT version_id FROM node_sync_versions WHERE version_id = ?', [edit.versionId]);
  const before = await loadCompanionWorkspaceNodeFromDb(db, edit.nodeId);
  await requireEditableContentNode(db, edit.nodeId);
  const base = await loadRetainedSyncNodeVersionFact(db, edit.baseVersionId);
  if (!base || (base.snapshot.kind !== 'topic' && base.snapshot.kind !== 'item')) throw new Error('content_edit_base_unavailable');
  assertNodeTextForSave({ content: edit.content, kind: base.snapshot.kind, title: base.snapshot.title,
    anchorLink: parseStoredAnchorLink(base.snapshot.anchor_link),
    ...(edit.reveal === undefined ? {} : { reveal: edit.reveal }) });
  const previous = await loadCurrentSyncNodeRecord(db, edit.nodeId, false);
  const children = await readCompanionContentAnchors(db, edit.nodeId);
  const hostName = await iosCompanionHostName(db);
  const result = await applyLocalContentEdit(db, {
    ...edit,
    hideTitleHeading: Boolean(base.snapshot.hide_title_heading),
    hostName,
    title: resolveNodeDerivedTitle({ isTitleManual: Boolean(base.snapshot.is_title_manual),
      kind: base.snapshot.kind, title: base.snapshot.title }, edit.content)
  }, undefined, { enqueueSearchInvalidations: false });
  if (!result.current.version_id) throw new Error('content_edit_result_unavailable');
  if (edit.holdId) {
    await retainLocalEditBase(db, {
      holdId: edit.holdId, nodeId: edit.nodeId, versionId: result.submittedVersionId
    });
  }
  await remapCompanionContentAnchors({ db, children, hostName, updatedAt: edit.updatedAt,
    previousContent: previous?.body_text ?? '', nextContent: result.current.body_text ?? '' });
  const after = await loadCompanionWorkspaceNodeFromDb(db, edit.nodeId);
  if (recordHistory && !alreadySubmitted && before && after) await recordCompanionContentHistory(db, { edit, before, after });
  return {
    ...(result.current.snapshot.kind === 'item' ? { reveal: result.current.snapshot.reveal ?? null } : {}),
    content: result.current.body_text ?? '',
    currentVersionId: result.current.version_id,
    submittedVersionId: result.submittedVersionId
  };
}

async function requireEditableContentNode(db: DbPort, nodeId: string) {
  const [visible] = await db.query(`WITH RECURSIVE target AS (
    SELECT id, parent_id, deleted_at, kind FROM nodes WHERE id = ?
  ), lineage(id, parent_id, deleted_at) AS (
    SELECT id, parent_id, deleted_at FROM target
    UNION
    SELECT parent.id, parent.parent_id, parent.deleted_at FROM nodes parent
      JOIN lineage child ON parent.id = child.parent_id
  ) SELECT id FROM target WHERE kind IN ('topic', 'item')
    AND NOT EXISTS (SELECT 1 FROM lineage WHERE deleted_at IS NOT NULL)
    AND EXISTS (SELECT 1 FROM lineage WHERE parent_id IS NULL)`, [nodeId]);
  if (!visible) throw new Error('This content cannot be edited on this device.');
}
