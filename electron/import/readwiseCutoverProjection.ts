import { createHash } from 'node:crypto';

import { matchesReadwiseApiEpubProjection } from '../../lib/core/readwise/readwiseApiEpubProjection.js';
import { stableReadwiseEpubNodeId, type PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiFrozenResources } from '../database/readwiseApiFrozenResourceStage.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { loadReadwiseCutoverStage, saveReadwiseCutoverStage } from '../database/readwiseCutoverStage.js';

import type { ReadwiseApiPreparedResources } from './readwiseApiDocumentCommit.js';
import { buildReadwiseApiEpubBookNodes } from './readwiseApiEpubBookTree.js';
import { readReadwiseApiEpubBookBodies } from './readwiseApiEpubMaterialization.js';
import { withOriginalEpubBody } from './readwiseOriginalEpubCommit.js';

interface Receipt { inputHash: string; bodyHash: string }
const KIND = 'cutover-projection-v1';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function verifyCutoverEpub(connectionRef: string, document: PreparedReadwiseApiDocument, record = false) {
  if (document.category !== 'epub') return;
  const source = loadReadwiseApiImportSource(connectionRef, document.id);
  if (!source?.nodeId) throw new Error(`readwise_source_cutover_projection_missing:${document.id}`);
  const resources = loadReadwiseApiFrozenResources(connectionRef, document.id);
  const finalDocument = finalCutoverDocument(document, resources, source.title ?? document.title);
  if (!matchesReadwiseApiEpubProjection(source.state.epubProjection ?? null, finalDocument)) {
    throw new Error(`readwise_source_cutover_epub_projection_incomplete:${document.id}`);
  }
  const bodies = readReadwiseApiEpubBookBodies(source.nodeId);
  const expected = resources?.originalEpub?.images ?? resources?.epubImages ?? finalDocument.epubStructure;
  if (!expected || !matchesBookBodies(connectionRef, document.id, source.nodeId, expected, bodies)) {
    throw new Error(`readwise_source_cutover_projection_body_mismatch:${document.id}`);
  }
  const receipt = { inputHash: hash(document), bodyHash: hash(bodies) };
  const saved = loadReadwiseCutoverStage<Receipt>(connectionRef, KIND, document.id);
  if (saved && (saved.inputHash !== receipt.inputHash || saved.bodyHash !== receipt.bodyHash)) {
    throw new Error(`readwise_source_cutover_projection_changed:${document.id}`);
  }
  if (record || !saved) saveReadwiseCutoverStage(connectionRef, KIND, receipt, document.id);
}

export function finalCutoverDocument(
  document: PreparedReadwiseApiDocument, resources: ReadwiseApiPreparedResources | null, title: string
) {
  return resources?.originalEpub
    ? withOriginalEpubBody({ candidate: resources.originalEpub, document, target: { title } }) : document;
}

export function assertCutoverBookUnedited(nodeId: string | null) {
  if (!nodeId) return;
  const edited = openDatabaseConnection().driver.queryOne<{ id: string }>(
    `WITH RECURSIVE tree(id) AS (
      SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL
      UNION ALL SELECT n.id FROM nodes n JOIN tree t ON n.parent_id=t.id WHERE n.deleted_at IS NULL
    ) SELECT n.id FROM nodes n JOIN tree t ON n.id=t.id
    WHERE (n.id = ? OR n.id LIKE 'node-epub-%') AND n.updated_at > COALESCE(
      (SELECT MAX(last_imported_at) FROM import_sources WHERE latest_node_id = ?), n.created_at)
    LIMIT 1`, [nodeId, nodeId, nodeId]
  );
  if (edited) throw new Error('readwise_source_cutover_user_edit_conflict');
}

function matchesBookBodies(
  connectionRef: string, documentId: string, rootNodeId: string,
  expected: Pick<NonNullable<PreparedReadwiseApiDocument['epubStructure']>, 'rootBody' | 'sections'>,
  bodies: ReturnType<typeof readReadwiseApiEpubBookBodies>
) {
  const nodes = buildReadwiseApiEpubBookNodes(expected.sections);
  const bodyById = new Map(bodies.map((body) => [body.id, body.content]));
  if (bodies.length !== nodes.length + 1 || !bodyById.get(rootNodeId)?.includes(expected.rootBody)) return false;
  return nodes.every((node) => {
    const id = stableReadwiseEpubNodeId(connectionRef, documentId, node.key);
    const row = openDatabaseConnection().driver.queryOne<{ parent_id: string; title: string }>(
      'SELECT parent_id, title FROM nodes WHERE id = ? AND deleted_at IS NULL', [id]
    );
    const parentId = node.parentKey ? stableReadwiseEpubNodeId(connectionRef, documentId, node.parentKey) : rootNodeId;
    return row?.title === node.title && row.parent_id === parentId && bodyById.get(id) === node.content;
  });
}
