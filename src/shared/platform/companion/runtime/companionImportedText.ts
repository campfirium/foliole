import { buildImportRecord, importEventStatement, importSourceStatement } from '../../../../../lib/core/database/importRecordStatements';
import { resolveBackfilledNodeOpeningTextById } from '../../../../../lib/core/database/nodeOpeningTextBackfill';
import type { NodeResourceReference } from '../../../../../lib/core/database/nodeResourceReferences';
import { hashTextBody } from '../../../../../lib/core/database/textBodyHash';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { PreparedImportRecord } from '../../../../../lib/core/import/contract';
import type { PreparedBookNode } from '../../../../../lib/core/import/epub/epubPreparedBook';
import { createEpubGeneratedNodeId } from '../../../../../lib/core/import/epubGeneratedNodeIdentity';
import { importedTitleCandidate } from '../../../../../lib/core/import/importedTitleCandidate';
import { resolveNodeOpeningText } from '../../../../../lib/core/nodes/nodeOpeningPreview';
import { saveLocalCurrentParentOrderWithDbPort } from '../../../../../lib/core/sync/currentParentOrderStore';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { readFramedSyncObjectPayload } from '../../../../../lib/core/sync/framedSyncObjectStatePayload';
import { assertNodeTextForSave } from '../../../ui/nodeTextSaveBudget';

import { commitCompanionNodeHistoryWithDb } from './companionNodeHistory';
import { iosCompanionContentHash, iosCompanionHostName, markIosCompanionMutation } from './iosCompanionMutationState';

/** Called inside the current library writer transaction after validating the target. */
export async function persistCompanionImportedTextWithDb(db: DbPort, prepared: PreparedImportRecord, parentNodeId: string,
  resourceReferences: NodeResourceReference[] = [], chapters: (PreparedBookNode & { resourceReferences: NodeResourceReference[] })[] = []) {
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
  const nodes = buildImportedBookNodes(node, prepared, chapters);
  const versions = await Promise.all(nodes.map(child => toWorkspaceNativeNodeVersion(child, hostName)));
  await commitCompanionNodeHistoryWithDb(db, versions, 'Import file', 'local_mutation', nodes.map(child => child.id));
  if (chapters.length) await saveImportedBookOpenings(db, nodes);
  const parents = new Set(nodes.slice(1).map(child => child.parentNodeId));
  for (const parentId of parents) await saveLocalCurrentParentOrderWithDbPort(db, { parentId: parentId!,
    childIds: nodes.filter(child => child.parentNodeId === parentId).map(child => child.id), hostName, now: prepared.importedAt });
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
  return { ...node, currentVersionId: versions[0]!.version_id };
}

async function resolveTitle(db: DbPort, desired: string) {
  let sequence = 1;
  let title = importedTitleCandidate(desired);
  while ((await db.query('SELECT id FROM nodes WHERE deleted_at IS NULL AND title = ?', [title])).length) {
    title = importedTitleCandidate(desired, ++sequence);
  }
  return title;
}

function buildImportedBookNodes(node: WorkspaceNodeSnapshot, prepared: PreparedImportRecord,
  chapters: (PreparedBookNode & { resourceReferences: NodeResourceReference[] })[]) {
  const nodes = [node];
  const ids = new Map<string, string>();
  for (const chapter of chapters) {
    const id = createEpubGeneratedNodeId(hashTextBody(`${prepared.sourceFingerprint}\u001f${chapter.key}`));
    ids.set(chapter.key, id);
    const child = { ...node, id, title: chapter.title, content: chapter.content,
      hideTitleHeading: chapter.hideTitleHeading, resourceReferences: chapter.resourceReferences,
      openingText: resolveNodeOpeningText(chapter.content, chapter.title),
      parentNodeId: chapter.parentKey ? ids.get(chapter.parentKey) ?? node.id : node.id };
    delete child.importSourceFingerprint; delete child.importContentFingerprint;
    assertNodeTextForSave(child); nodes.push(child);
  }
  return nodes;
}

async function saveImportedBookOpenings(db: DbPort, nodes: WorkspaceNodeSnapshot[]) {
  const openings = resolveBackfilledNodeOpeningTextById({ pdfOpeningRows: [],
    nodeOrderRows: nodes.map(node => ({ node_id: node.id })),
    nodeRows: nodes.map((node, index) => ({ content: node.content, id: node.id, kind: node.kind,
      parent_id: index ? node.parentNodeId : null, title: node.title })) });
  for (const [id, opening] of openings) await db.run('UPDATE nodes SET opening_text = ? WHERE id = ?', [opening, id]);
}
