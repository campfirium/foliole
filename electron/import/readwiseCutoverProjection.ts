import { createHash } from 'node:crypto';

import { normalizeImportedMarkdownHeadings } from '../../lib/core/import/normalizeImportedHeadings.js';
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
  const bodyMismatch = expected
    ? findBookBodyMismatch(connectionRef, document.id, source.nodeId, expected, bodies)
    : 'expected_body_missing';
  if (bodyMismatch) {
    throw new Error(`readwise_source_cutover_projection_body_mismatch:${document.id}:${bodyMismatch}`);
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

function findBookBodyMismatch(
  connectionRef: string, documentId: string, rootNodeId: string,
  expected: Pick<NonNullable<PreparedReadwiseApiDocument['epubStructure']>, 'rootBody' | 'sections'>,
  bodies: ReturnType<typeof readReadwiseApiEpubBookBodies>
) {
  const nodes = buildReadwiseApiEpubBookNodes(expected.sections);
  const bodyById = new Map(bodies.map((body) => [body.id, body.content]));
  if (bodies.length !== nodes.length + 1) return `body_count:${bodies.length}:${nodes.length + 1}`;
  const rootBody = bodyById.get(rootNodeId) ?? '';
  const expectedRootBody = normalizeExpectedRootBody(expected.rootBody);
  if (!rootBody.includes(expectedRootBody)) {
    return rootBodyMismatch(rootBody, expectedRootBody);
  }
  for (const node of nodes) {
    const id = stableReadwiseEpubNodeId(connectionRef, documentId, node.key);
    const row = openDatabaseConnection().driver.queryOne<{ parent_id: string; title: string }>(
      'SELECT parent_id, title FROM nodes WHERE id = ? AND deleted_at IS NULL', [id]
    );
    const parentId = node.parentKey ? stableReadwiseEpubNodeId(connectionRef, documentId, node.parentKey) : rootNodeId;
    if (!row) return `section_missing:${id}`;
    if (row.title !== node.title) return `section_title:${id}`;
    if (row.parent_id !== parentId) return `section_parent:${id}`;
    if (bodyById.get(id) !== node.content) return `section_body:${id}`;
  }
  return null;
}

function textHash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function normalizeExpectedRootBody(value: string) {
  const sentinel = '# __foliole_imported_title__\n\n';
  const normalized = normalizeImportedMarkdownHeadings(`${sentinel}${value}`);
  return normalized.slice(normalized.indexOf('\n\n') + 2);
}

function rootBodyMismatch(actual: string, expected: string) {
  const start = actual.indexOf(expected.slice(0, Math.min(64, expected.length)));
  let differentAt = -1;
  if (start >= 0) {
    while (differentAt + 1 < expected.length && actual[start + differentAt + 1] === expected[differentAt + 1]) {
      differentAt += 1;
    }
    differentAt += 1;
  }
  return `root_body:${actual.length}:${expected.length}:${start}:${differentAt}:${textHash(actual)}:${textHash(expected)}`;
}
