import { SNAPSHOT_VISIBLE_NODES_CTE_SQL as VISIBLE_NODES_CTE_SQL } from '../../../../../lib/core/database/workspaceVisibleNodesSql';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { applyLocalContentEdit } from '../../../../../lib/core/sync/localContentEdit';
import { releaseLocalEditBase, retainLocalEditBase } from '../../../../../lib/core/sync/nodeVersionLocalEditHold';
import { collectNodeVersionPayloads } from '../../../../../lib/core/sync/nodeVersionPayloadCollector';
import { loadCurrentSyncNodeRecord, loadStoredSyncNodeVersionRecord } from '../../../../../lib/core/sync/syncNodeGraph';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { isNativeCompanionNodeVersionWriteRuntime } from '../../companionWorkspaceRuntimeRepository';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { iosCompanionHostName } from '../runtime/iosCompanionMutationState';
import { runCompanionHighValueMutationTask } from '../sync/mutation/companionSyncMutationRevision';

import { readCompanionContentAnchors, remapCompanionContentAnchors } from './companionContentAnchorRemap';
import type { CompanionContentEdit, CompanionContentSource } from './companionContentEditContract';

export async function readCompanionContentSource(nodeId: string, holdId?: string): Promise<CompanionContentSource> {
  const read = async (db: DbPort) => {
    await requireEditableTopic(db, nodeId);
    const current = await loadCurrentSyncNodeRecord(db, nodeId, false);
    if (!current?.version_id || current.snapshot.deleted_at) throw new Error('content_edit_node_unavailable');
    if (holdId) await retainLocalEditBase(db, { holdId, nodeId, versionId: current.version_id });
    return { content: current.body_text ?? '', versionId: current.version_id };
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
  return runCompanionHighValueMutationTask(async () => {
    const result = await writeIosCompanionDatabase((port) => port.transaction(async (db) => {
      await requireEditableTopic(db, edit.nodeId);
      const base = await loadStoredSyncNodeVersionRecord(db, edit.baseVersionId, false);
      if (!base || base.snapshot.kind !== 'topic') throw new Error('content_edit_base_unavailable');
      const previous = await loadCurrentSyncNodeRecord(db, edit.nodeId, false);
      const children = await readCompanionContentAnchors(db, edit.nodeId);
      const hostName = await iosCompanionHostName(db);
      const result = await applyLocalContentEdit(db, {
        ...edit,
        hideTitleHeading: Boolean(base.snapshot.hide_title_heading),
        hostName,
        title: base.snapshot.title
      }, undefined, { enqueueSearchInvalidations: false });
      if (!result.current.version_id) throw new Error('content_edit_result_unavailable');
      if (edit.holdId) {
        await retainLocalEditBase(db, {
          holdId: edit.holdId, nodeId: edit.nodeId, versionId: result.submittedVersionId
        });
      }
      await remapCompanionContentAnchors({ db, children, hostName, updatedAt: edit.updatedAt,
        previousContent: previous?.body_text ?? '', nextContent: result.current.body_text ?? '' });
      return {
        content: result.current.body_text ?? '',
        currentVersionId: result.current.version_id,
        submittedVersionId: result.submittedVersionId
      };
    }));
    await writeIosCompanionDatabase((db) => collectNodeVersionPayloads(db, edit.nodeId))
      .catch((error: unknown) => { console.warn('[node-version-retention] local collection failed', error); });
    return result;
  });
}

async function requireEditableTopic(db: DbPort, nodeId: string) {
  const [visible] = await db.query(`${VISIBLE_NODES_CTE_SQL}
    SELECT n.id FROM nodes n JOIN visible_nodes v ON v.id = n.id WHERE n.id = ? AND n.kind = 'topic'`, [nodeId]);
  if (!visible) throw new Error('This topic cannot be edited on this device.');
}
