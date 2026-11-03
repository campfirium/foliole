import { buildImportRecord, importEventStatement, importSourceStatement } from '../../../../../lib/core/database/importRecordStatements';
import type { NodeResourceReference } from '../../../../../lib/core/database/nodeResourceReferences';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { PreparedImportRecord } from '../../../../../lib/core/import/contract';
import { importedTitleCandidate } from '../../../../../lib/core/import/importedTitleCandidate';
import { resolveNodeOpeningText } from '../../../../../lib/core/nodes/nodeOpeningPreview';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { readFramedSyncObjectPayload } from '../../../../../lib/core/sync/framedSyncObjectStatePayload';
import { assertNodeTextForSave } from '../../../ui/nodeTextSaveBudget';

import { commitCompanionNodeHistoryWithDb } from './companionNodeHistory';
import { iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation } from './iosCompanionMutationState';

/** Called inside the current library writer transaction after validating the target. */
export async function persistCompanionImportedTextWithDb(db: DbPort, prepared: PreparedImportRecord, parentNodeId: string,
  resourceReferences: NodeResourceReference[] = []) {
  if (!prepared.content.trim()) throw new Error('The selected file has no readable text.');
  const title = await resolveTitle(db, prepared.nodeTitle);
  const node: WorkspaceNodeSnapshot = {
    id: `node-${crypto.randomUUID()}`, parentNodeId, kind: 'topic', title,
    content: prepared.content, isTitleManual: true, hideTitleHeading: prepared.hideTitleHeading,
    openingText: resolveNodeOpeningText(prepared.content, title), anchorLink: null,
    createdAt: prepared.importedAt, updatedAt: prepared.importedAt, reading: null, reveal: null, review: null,
    importSourceFingerprint: prepared.sourceFingerprint, importContentFingerprint: prepared.contentFingerprint,
    resourceReferences
  };
  assertNodeTextForSave(node);
  const hostName = await iosCompanionHostName(db);
  const version = await toWorkspaceNativeNodeVersion(node, hostName);
  await commitCompanionNodeHistoryWithDb(db, [version], 'Import file', 'local_mutation', [node.id]);
  const record = buildImportRecord(prepared, prepared.degradedReason ? 'degraded' : 'imported', 'new', {
    nodeId: node.id, degradedReason: prepared.degradedReason, failureReason: null
  });
  for (const statement of [importSourceStatement(record), importEventStatement(record)]) {
    await db.run(statement.sql, statement.params);
  }
  const payload = await readFramedSyncObjectPayload(db, { globalId: prepared.sourceFingerprint, objectType: 'import_source' });
  if (!payload) throw new Error('Import source was not saved.');
  await markIosCompanionMutation({ db, objectType: 'import_source', objectId: prepared.sourceFingerprint,
    contentHash: await iosCompanionContentHash(JSON.parse(payload)), hostName, updatedAt: prepared.importedAt });
  return { ...node, currentVersionId: version.version_id };
}

async function resolveTitle(db: DbPort, desired: string) {
  let sequence = 1;
  let title = importedTitleCandidate(desired);
  while ((await db.query('SELECT id FROM nodes WHERE deleted_at IS NULL AND title = ?', [title])).length) {
    title = importedTitleCandidate(desired, ++sequence);
  }
  return title;
}
