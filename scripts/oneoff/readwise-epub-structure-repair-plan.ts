import { createHash } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { requireResolvedNodeBody } from '../../lib/core/database/nodeBodyResolution.js';
import { buildReadwiseApiEpubBookNodes } from '../../lib/core/readwise/readwiseApiEpubBookTree.js';
import { prepareReadwiseApiEpubStructure } from '../../lib/core/readwise/readwiseApiEpubStructure.js';
import { stableReadwiseEpubNodeId } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  buildReadwiseUnlocatedNodeId,
  isReadwiseUnlocatedNodeId
} from '../../lib/core/readwise/readwiseOriginalEpubUnlocated.js';

import { auditReadwiseEpubCorpus, type ReadwiseEpubSourceSnapshot } from './readwise-epub-corpus-audit.js';
import { buildRepairBodies } from './readwise-epub-structure-repair-bodies.js';
import { captureRepairProtection } from './readwise-epub-structure-repair-guards.js';
import {
  hasResolvedRepairHighlight,
  relocateRepairHighlight
} from './readwise-epub-structure-repair-highlights.js';
import type {
  ReadwiseEpubBookRepair,
  ReadwiseEpubStructureRepairPlan
} from './readwise-epub-structure-repair-types.js';

interface NodeRow {
  anchor_link: string | null;
  body_blob_data: unknown;
  body_blob_hash: string | null;
  content: string;
  created_at: string;
  id: string;
  image_regions: string | null;
  is_title_manual: number;
  parent_id: string | null;
  title: string;
}

export function buildReadwiseEpubStructureRepairPlan(input: {
  driver: DatabaseDriver;
  generatedAt?: string;
  sourceByDocumentId: ReadonlyMap<string, ReadwiseEpubSourceSnapshot>;
}): ReadwiseEpubStructureRepairPlan {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const sources = input.driver.queryAll<{
    latest_node_id: string; remote_connection_ref: string; remote_document_id: string;
  }>(`SELECT latest_node_id, remote_connection_ref, remote_document_id FROM import_sources
      WHERE remote_provider = 'readwise'
      AND json_extract(remote_import_state_json, '$.metadata.category') = 'epub'
      AND json_extract(remote_import_state_json, '$.bodyState') = 'materialized'
      ORDER BY remote_document_id`);
  if (sources.length !== 28) throw new Error(`readwise_epub_repair_scope_mismatch:${sources.length}`);
  const corpusAudit = auditReadwiseEpubCorpus(input.sourceByDocumentId);
  if (corpusAudit.books.length !== 29) throw new Error(`readwise_epub_corpus_scope_mismatch:${corpusAudit.books.length}`);
  const books = sources.map((source) => buildBook(input.driver, source, input.sourceByDocumentId));
  const scopedIds = new Set(sources.map((source) => source.remote_document_id));
  if (corpusAudit.books.filter((book) => !scopedIds.has(book.documentId)).length !== 1) {
    throw new Error('readwise_epub_corpus_extra_document_mismatch');
  }
  const highlights = books.flatMap((book) => book.highlights);
  const counts = {
    anchoredHighlights: highlights.filter(hasResolvedRepairHighlight).length,
    attachmentCopies: sum(books, 'attachmentCopies'), books: books.length, bodies: sum(books, 'bodies'),
    headings: books.reduce((total, book) => total + book.headingCount, 0),
    highlights: highlights.length, moves: sum(books, 'moves'),
    rootHighlights: books.reduce((total, book) => (
      total + book.highlights.filter((item) => item.parentId === book.rootNodeId).length
    ), 0),
    staleNodes: sum(books, 'staleNodeIds'),
    unlocatedHighlights: books.reduce((total, book) => (
      total + book.highlights.filter((item) => item.parentId === book.unlocatedNodeId).length
    ), 0),
    unanchoredHighlights: highlights.filter((item) => !hasResolvedRepairHighlight(item)).length
  };
  const protection = captureRepairProtection(input.driver, books.map((book) => book.rootNodeId)).summary;
  const payload = { books, corpusAudit, counts, protection };
  return { ...payload, generatedAt, planHash: sha256(JSON.stringify(payload)) };
}

function buildBook(
  driver: DatabaseDriver,
  source: { latest_node_id: string; remote_connection_ref: string; remote_document_id: string },
  sourceByDocumentId: ReadonlyMap<string, ReadwiseEpubSourceSnapshot>
): ReadwiseEpubBookRepair {
  const snapshot = sourceByDocumentId.get(source.remote_document_id);
  if (!snapshot) throw new Error(`readwise_epub_source_html_missing:${source.remote_document_id}`);
  const structure = prepareReadwiseApiEpubStructure(snapshot.html);
  const projected = buildReadwiseApiEpubBookNodes(structure.sections);
  const rows = readTree(driver, source.latest_node_id);
  const root = rows.find((row) => row.id === source.latest_node_id);
  if (!root) throw new Error(`readwise_epub_root_missing:${source.remote_document_id}`);
  const generatedRows = rows.filter((row) => row.id.startsWith('node-epub-'));
  const oldGenerated = orderGeneratedRows(generatedRows, source, structure.legacyMarkerKeys ?? []);
  const desired = projected.map((node) => ({
    ...node, nodeId: stableReadwiseEpubNodeId(source.remote_connection_ref, source.remote_document_id, node.key)
  }));
  assertPristineGeneratedProjection(
    source, structure.legacyMarkerKeys ?? [], desired.map((node) => node.key), oldGenerated
  );
  const desiredIds = new Set(desired.map((node) => node.nodeId));
  desired.forEach((node) => {
    if (!oldGenerated.some((row) => row.id === node.nodeId)) {
      throw new Error(`readwise_epub_heading_not_materialized:${source.remote_document_id}:${node.key}`);
    }
  });
  const contentById = new Map<string, string[]>([[root.id, []]]);
  let targetId = root.id;
  oldGenerated.forEach((row) => {
    if (desiredIds.has(row.id)) targetId = row.id;
    const chunks = contentById.get(targetId) ?? [];
    chunks.push(body(row));
    contentById.set(targetId, chunks);
  });
  const coverage = buildRepairBodies({
    contentById, desired, documentId: source.remote_document_id,
    oldGenerated: oldGenerated.map((row) => ({ ...row, content: body(row) })),
    root: { ...root, content: body(root) }, structure
  });
  const staleNodeIds = oldGenerated.map((row) => row.id).filter((id) => !desiredIds.has(id));
  const staleTargets = buildStaleTargets(oldGenerated, desiredIds, root.id);
  const { highlights, unlocatedNodeId } = buildRepairHighlights(source, rows, coverage.bodies, root.id);
  const highlightIds = new Set(highlights.map((item) => item.nodeId));
  const moves = rows.filter((row) => row.parent_id && staleTargets.has(row.parent_id)
    && !staleNodeIds.includes(row.id) && !highlightIds.has(row.id))
    .map((row) => ({ nodeId: row.id, parentId: staleTargets.get(row.parent_id!)! }));
  const attachmentCopies = staleNodeIds.flatMap((nodeId) => driver.queryAll<{
    attachment_id: string; role: string;
  }>('SELECT attachment_id, role FROM node_attachments WHERE node_id = ?', [nodeId])
    .map((item) => ({ attachmentId: item.attachment_id, nodeId: staleTargets.get(nodeId)!, role: item.role })));
  return {
    attachmentCopies, bodies: coverage.bodies, documentId: source.remote_document_id, headingCount: desired.length,
    currentCoverageHash: coverage.currentCoverageHash, highlights, moves, newCoverageHash: coverage.newCoverageHash,
    reusedNodeIds: desired.map((node) => node.nodeId), rootNodeId: root.id,
    sourceCoverageHash: coverage.sourceCoverageHash, staleNodeIds, title: root.title,
    unlocatedNodeId
  };
}

function orderGeneratedRows(
  rows: NodeRow[],
  source: { remote_connection_ref: string; remote_document_id: string },
  markerKeys: string[]
) {
  const order = new Map(markerKeys.map((key, index) => [
    stableReadwiseEpubNodeId(source.remote_connection_ref, source.remote_document_id, key), index
  ]));
  return [...rows].sort((left, right) => (
    (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    || left.created_at.localeCompare(right.created_at)
    || left.id.localeCompare(right.id)
  ));
}

function buildRepairHighlights(
  source: { remote_connection_ref: string; remote_document_id: string },
  rows: NodeRow[],
  bodies: Array<{ content: string; nodeId: string }>,
  rootId: string
) {
  const unlocatedNodeId = buildReadwiseUnlocatedNodeId(
    source.remote_connection_ref, source.remote_document_id
  );
  const highlights = rows.filter((row) => (
    row.id.startsWith('node-readwise-') && row.id !== rootId && !isReadwiseUnlocatedNodeId(row.id)
  )).map((row) => relocateRepairHighlight(row, bodies, rootId, unlocatedNodeId));
  return { highlights, unlocatedNodeId };
}

function assertPristineGeneratedProjection(
  source: { remote_connection_ref: string; remote_document_id: string },
  legacyMarkerKeys: string[],
  projectedMarkerKeys: string[],
  rows: NodeRow[]
) {
  const ids = (keys: string[]) => keys.map((key) => (
    stableReadwiseEpubNodeId(source.remote_connection_ref, source.remote_document_id, key)
  ));
  const actual = rows.map((row) => row.id);
  const matches = (expected: string[]) => expected.length === actual.length
    && expected.every((id, index) => actual[index] === id);
  if (!matches(ids(legacyMarkerKeys)) && !matches(ids(projectedMarkerKeys))) {
    throw new Error(`readwise_epub_generated_projection_not_pristine:${source.remote_document_id}`);
  }
}

function readTree(driver: DatabaseDriver, rootNodeId: string) {
  return driver.queryAll<NodeRow>(`WITH RECURSIVE tree AS (
    SELECT * FROM nodes WHERE id = ? AND deleted_at IS NULL
    UNION ALL SELECT child.* FROM nodes child JOIN tree ON child.parent_id = tree.id
    WHERE child.deleted_at IS NULL
  ) SELECT tree.*, cbd.data body_blob_data FROM tree
    LEFT JOIN content_blob_data cbd ON cbd.hash = tree.body_blob_hash`, [rootNodeId]);
}

function body(row: NodeRow) {
  return requireResolvedNodeBody(row, row.id).content;
}

function buildStaleTargets(rows: NodeRow[], desiredIds: ReadonlySet<string>, rootId: string) {
  const targets = new Map<string, string>();
  let target = rootId;
  rows.forEach((row) => {
    if (desiredIds.has(row.id)) target = row.id;
    else targets.set(row.id, target);
  });
  return targets;
}

function sum(books: ReadwiseEpubBookRepair[], key: 'attachmentCopies' | 'bodies' | 'highlights' | 'moves' | 'staleNodeIds') {
  return books.reduce((total, book) => total + book[key].length, 0);
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
