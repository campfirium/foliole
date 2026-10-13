import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion.js';
import { buildCanonicalExternalDocumentPayload } from '../../lib/core/sync/canonicalExternalResourcePayload.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { hostedAttachments, hostedContentBodies, hostedExternalDocument, hostedLegalVersion } from './ios-hosted-request-seed-data.js';

const createdAt = '2026-07-21T00:00:00.000Z';

export async function seedIosHostedRequestLibrary(db: DbPort, scenario: 'legal' | 'contentResource' | 'stateInitial') {
  if (scenario === 'legal') return seedLegal(db);
  if (scenario === 'stateInitial') {
    await seedSyntheticNode(db, 'ios-state-node', 'State acceptance', '');
    return;
  }
  for (const name of ['topic', 'missing', 'corrupt'] as const) {
    await seedSyntheticNode(db, `ios-content-${name}`, name === 'topic' ? 'Content Topic' : `ios-content-${name}`,
      hostedContentBodies[name].text, name === 'topic');
  }
  await seedExternalAndPdf(db);
}

async function seedSyntheticNode(db: DbPort, id: string, title: string, content: string, resources = false) {
  // These corpus nodes had no history; generate their first current-format synthetic facts.
  const record = await toWorkspaceNativeNodeVersion({
    id, title, content, kind: 'topic', parentNodeId: null, isTitleManual: false, hideTitleHeading: false,
    reveal: null, anchorLink: null, reading: null, review: null, createdAt, updatedAt: createdAt,
    openingText: resources ? 'Topic opening' : null,
    resourceReferences: resources ? Object.entries(hostedAttachments).map(([name, resource]) => ({
      storage_key: `${resource.hash}.${name === 'valid' ? 'pdf' : 'png'}`, role: 'reference',
      original_name: `ios-acceptance-${name}-attachment.bin`
    })) : []
  }, 'acceptance-desktop', `ver_hosted_${id}`);
  await applySyncNodesWithDbPort(db, [record]);
}

async function seedLegal(db: DbPort) {
  await db.run(`INSERT OR IGNORE INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('special-inbox', 'folder', 'Inbox', '', ?, ?)`, [createdAt, createdAt]);
  const version = hostedLegalVersion;
  const record: NativeSyncNodeRecord = {
    ...version, object_type: 'node', snapshot: JSON.parse(version.snapshot_json),
    ancestor_version_ids: [], parent_version_ids: [], updated_at: version.created_at, version_created_at: version.created_at
  };
  await applySyncNodesWithDbPort(db, [record]);
  // Keep the corpus's historical identity and exact source snapshot. Request projection is tested separately.
  await db.run(`UPDATE node_sync_versions SET snapshot_json = ?, content_hash = ?, body_text = ? WHERE version_id = ?`,
    [version.snapshot_json, version.content_hash, version.body_text, version.version_id]);
}

async function seedExternalAndPdf(db: DbPort) {
  const external = { ...hostedExternalDocument, content: hostedContentBodies.external.text };
  const pdf = { attachment_id: hostedAttachments.valid.hash, page: 1,
    text: 'Extracted pdf-cobalt-token', page_width: 800, page_height: 1200 };
  await db.transaction(async tx => {
    await applySyncObjectInTransaction(tx, {
      object_type: 'external_document', object_id: external.document_id, deleted_at: null, updated_at: createdAt,
      content_hash: computeSyncContentHash('external_document', buildCanonicalExternalDocumentPayload(external)),
      payload_json: JSON.stringify(external)
    });
    await applySyncObjectInTransaction(tx, {
      object_type: 'pdf_page_text', object_id: `${pdf.attachment_id}:1`, deleted_at: null, updated_at: createdAt,
      content_hash: computeSyncContentHash('pdf_page_text', pdf), payload_json: JSON.stringify(pdf)
    });
  });
}
