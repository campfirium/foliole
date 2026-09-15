import { createHash } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { requireResolvedNodeBody } from '../../lib/core/database/nodeBodyResolution.js';
import { buildReadwiseUnlocatedNodeId } from '../../lib/core/readwise/readwiseOriginalEpubUnlocated.js';

import type { DuplicateRootBookMerge, DuplicateRootRepairPlan } from './readwise-epub-duplicate-root-types.js';
import { relocateRepairHighlight } from './readwise-epub-structure-repair-highlights.js';

interface NodeRow {
  anchor_link: string | null;
  body_blob_data: unknown;
  body_blob_hash: string | null;
  content: string;
  created_at: string;
  id: string;
  image_regions: string | null;
  kind: string;
  parent_id: string | null;
  position: number | null;
  title: string;
  tree_position: number | null;
}

interface SourceRow {
  latest_node_id: string;
  metadata_title: string;
  remote_connection_ref: string;
  remote_document_id: string;
}

export function buildDuplicateRootRepairPlan(
  driver: DatabaseDriver,
  generatedAt = new Date().toISOString()
): DuplicateRootRepairPlan {
  const folder = driver.queryOne<{ id: string }>(
    "SELECT id FROM nodes WHERE title='books' AND deleted_at IS NULL"
  );
  if (!folder) throw new Error('readwise_duplicate_books_folder_missing');
  const legacyRoots = readChildren(driver, folder.id).filter((row) => row.id.startsWith('node-readwise-book-'));
  const sources = driver.queryAll<SourceRow>(`SELECT latest_node_id, remote_connection_ref,
      remote_document_id, json_extract(remote_import_state_json, '$.metadata.title') metadata_title
    FROM import_sources WHERE remote_provider='readwise'
      AND json_extract(remote_import_state_json, '$.metadata.category')='epub'
      AND json_extract(remote_import_state_json, '$.bodyState')='materialized'
    ORDER BY remote_document_id`);
  const books = sources.flatMap((source) => {
    const matches = legacyRoots.filter((root) => normalizeTitle(root.title) === normalizeTitle(source.metadata_title));
    if (matches.length > 1) throw new Error(`readwise_duplicate_root_ambiguous:${source.remote_document_id}`);
    return matches.length === 1 ? [buildBook(driver, source, matches[0]!)] : [];
  });
  if (books.length !== 24 || sources.length - books.length !== 5) {
    throw new Error(`readwise_duplicate_root_scope_mismatch:${books.length}:${sources.length - books.length}`);
  }
  const summary = {
    books: books.length,
    generatedRetired: sum(books, 'legacyGeneratedIds'),
    highlightMerges: sum(books, 'highlightMerges'),
    highlightsRelocated: sum(books, 'relocatedHighlights'),
    inboxRootsRetired: books.length,
    unmatchedApiBooks: sources.length - books.length
  };
  const payload = { books, summary };
  return { ...payload, generatedAt, planHash: hash(JSON.stringify(payload)) };
}

function buildBook(driver: DatabaseDriver, source: SourceRow, legacyRoot: NodeRow): DuplicateRootBookMerge {
  const apiRows = readTree(driver, source.latest_node_id);
  const legacyRows = readTree(driver, legacyRoot.id);
  const apiRoot = apiRows.find((row) => row.id === source.latest_node_id);
  if (!apiRoot || apiRoot.parent_id !== 'special-inbox') {
    throw new Error(`readwise_duplicate_api_root_not_inbox:${source.remote_document_id}`);
  }
  const apiGenerated = depthFirst(apiRows, apiRoot.id).filter(isGenerated);
  const legacyGenerated = depthFirst(legacyRows, legacyRoot.id).filter(isGenerated);
  const generatedTargets = matchGenerated(legacyGenerated, apiGenerated, apiRoot.id);
  const legacyHighlights = legacyRows.filter(isHighlight);
  const apiHighlights = apiRows.filter((row) => row.id.startsWith('node-readwise-') && isHighlight(row));
  const highlightMerges = matchHighlights(legacyHighlights, apiHighlights);
  const mergedIds = new Set(highlightMerges.map((item) => item.sourceId));
  const bodies = [{ content: body(apiRoot), nodeId: legacyRoot.id }, ...apiGenerated.map((row) => ({
    content: body(row), nodeId: row.id
  }))];
  const unlocatedNodeId = buildReadwiseUnlocatedNodeId(source.remote_connection_ref, source.remote_document_id);
  const relocatedHighlights = legacyHighlights.filter((row) => !mergedIds.has(row.id))
    .map((row) => relocateRepairHighlight(row, bodies, legacyRoot.id, unlocatedNodeId));
  const highlightIds = new Set(legacyHighlights.map((row) => row.id));
  const moves = legacyRows.filter((row) => row.parent_id && generatedTargets.has(row.parent_id)
    && !isGenerated(row) && !highlightIds.has(row.id))
    .map((row) => ({ nodeId: row.id, parentId: generatedTargets.get(row.parent_id!)! }));
  return {
    apiRootId: apiRoot.id,
    apiTitle: apiRoot.title,
    directApiChildIds: apiRows.filter((row) => row.parent_id === apiRoot.id).map((row) => row.id).sort(),
    documentId: source.remote_document_id,
    generatedTransfers: legacyGenerated.map((row) => ({
      sourceId: row.id, targetId: generatedTargets.get(row.id) ?? legacyRoot.id
    })),
    highlightMerges,
    legacyGeneratedIds: legacyGenerated.map((row) => row.id).sort(),
    legacyRootId: legacyRoot.id,
    legacyTitle: legacyRoot.title,
    moves,
    relocatedHighlights,
    rootBody: body(apiRoot),
    rootBodyHash: hash(body(apiRoot)),
    unlocatedNodeId
  };
}

function matchGenerated(oldRows: NodeRow[], newRows: NodeRow[], rootId: string) {
  const queues = new Map<string, NodeRow[]>();
  newRows.forEach((row) => queues.set(normalizeTitle(row.title), [
    ...(queues.get(normalizeTitle(row.title)) ?? []), row
  ]));
  const targets = new Map<string, string>();
  let prior = rootId;
  oldRows.forEach((row) => {
    const queue = queues.get(normalizeTitle(row.title)) ?? [];
    const match = queue.shift();
    if (match) prior = match.id;
    targets.set(row.id, prior);
  });
  return targets;
}

function matchHighlights(oldRows: NodeRow[], newRows: NodeRow[]) {
  const byText = new Map<string, NodeRow[]>();
  newRows.forEach((row) => {
    const text = highlightText(row);
    if (text) byText.set(text, [...(byText.get(text) ?? []), row]);
  });
  return oldRows.flatMap((row) => {
    const matches = byText.get(highlightText(row)) ?? [];
    return matches.length === 1 ? [{ sourceId: row.id, targetId: matches[0]!.id }] : [];
  });
}

function readChildren(driver: DatabaseDriver, parentId: string) {
  return driver.queryAll<NodeRow>(`SELECT n.*, cbd.data body_blob_data, o.position tree_position
    FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash=n.body_blob_hash
    LEFT JOIN node_order o ON o.node_id=n.id WHERE n.parent_id=? AND n.deleted_at IS NULL`, [parentId]);
}

function readTree(driver: DatabaseDriver, rootId: string) {
  return driver.queryAll<NodeRow>(`WITH RECURSIVE tree AS (
      SELECT * FROM nodes WHERE id=? AND deleted_at IS NULL
      UNION ALL SELECT n.* FROM nodes n JOIN tree t ON n.parent_id=t.id WHERE n.deleted_at IS NULL
    ) SELECT tree.*, cbd.data body_blob_data, o.position tree_position FROM tree
      LEFT JOIN content_blob_data cbd ON cbd.hash=tree.body_blob_hash
      LEFT JOIN node_order o ON o.node_id=tree.id`, [rootId]);
}

function depthFirst(rows: NodeRow[], rootId: string) {
  const children = new Map<string, NodeRow[]>();
  rows.forEach((row) => {
    if (!row.parent_id) return;
    children.set(row.parent_id, [...(children.get(row.parent_id) ?? []), row]);
  });
  children.forEach((items) => items.sort((a, b) =>
    (a.tree_position ?? a.position ?? 1e9) - (b.tree_position ?? b.position ?? 1e9)
    || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)));
  const result: NodeRow[] = [];
  const visit = (id: string) => (children.get(id) ?? []).forEach((row) => { result.push(row); visit(row.id); });
  visit(rootId);
  return result;
}

function body(row: NodeRow) { return requireResolvedNodeBody(row, row.id).content; }
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function isGenerated(row: NodeRow) { return row.id.startsWith('node-epub-'); }
function isHighlight(row: NodeRow) { return highlightKind(row) === 'highlight'; }
function highlightKind(row: NodeRow) { try { return JSON.parse(row.anchor_link ?? '{}').kind; } catch { return null; } }
function highlightText(row: NodeRow) {
  try { return JSON.parse(row.anchor_link ?? '{}').locator?.originalText ?? ''; } catch { return ''; }
}
function normalizeTitle(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[：:]/gu, '').replace(/\s+/gu, ' ').trim();
}
function sum(books: DuplicateRootBookMerge[], key: keyof DuplicateRootBookMerge) {
  return books.reduce((total, book) => total + (book[key] as unknown[]).length, 0);
}
