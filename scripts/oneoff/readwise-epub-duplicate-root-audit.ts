import fs from 'node:fs';
import { createRequire } from 'node:module';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.js';
import { requireResolvedNodeBody } from '../../lib/core/database/nodeBodyResolution.js';

import { coverageHash, rootSourceContent } from './readwise-epub-structure-repair-guards.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
const databasePath = process.argv[2];
const receiptPath = process.argv[3];
if (!databasePath || !receiptPath) throw new Error('usage: <database> <repair receipt>');

interface NodeRow {
  body_blob_data: unknown;
  body_blob_hash: string | null;
  content: string;
  created_at: string;
  id: string;
  parent_id: string | null;
  position: number | null;
  title: string;
  tree_position: number | null;
}

const sqlite = new BetterSqlite3(databasePath, { fileMustExist: true, readonly: true });
const driver = createBetterSqlite3Driver(sqlite);
try {
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as {
    summary: { books: Array<{
      bodyCoverageHashes: { current: string; source: string };
      documentId: string;
      title: string;
    }> };
  };
  const booksFolder = driver.queryOne<{ id: string }>(
    "SELECT id FROM nodes WHERE title = 'books' AND deleted_at IS NULL"
  );
  if (!booksFolder) throw new Error('books folder missing');
  const legacyRoots = driver.queryAll<NodeRow>(`SELECT n.*, cbd.data body_blob_data,
      node_order.position tree_position
    FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
    LEFT JOIN node_order ON node_order.node_id = n.id
    WHERE n.parent_id = ? AND n.deleted_at IS NULL`, [booksFolder.id]);
  const legacy = legacyRoots.map((root) => {
    const ordered = generatedDepthFirst(root.id);
    const content = [rootSourceContent(body(root), root.title), ...ordered.map(body)].join('\n\n');
    const remoteIds = [...content.matchAll(/readwise\.io\/read\/([0-9a-z]+)/giu)].map((match) => match[1]!);
    return {
      hash: coverageHash(content), id: root.id, nodes: ordered.length,
      normalizedTitle: normalizeTitle(root.title), remoteIds: [...new Set(remoteIds)], title: root.title
    };
  });
  const mappings = receipt.summary.books.map((book) => {
    const apiSource = driver.queryOne<{ latest_node_id: string }>(
      "SELECT latest_node_id FROM import_sources WHERE remote_provider='readwise' AND remote_document_id=?",
      [book.documentId]
    );
    const source = driver.queryOne<{ metadata_title: string }>(
      `SELECT json_extract(remote_import_state_json, '$.metadata.title') metadata_title
       FROM import_sources WHERE remote_provider='readwise' AND remote_document_id=?`, [book.documentId]
    );
    const normalizedTitle = normalizeTitle(source?.metadata_title ?? book.title.replace(/ 2$/u, ''));
    const matches = legacy.filter((item) => (
      item.remoteIds.includes(book.documentId) || item.normalizedTitle === normalizedTitle
    ));
    return {
      apiRootId: apiSource?.latest_node_id ?? null,
      documentId: book.documentId,
      legacyMatches: matches,
      title: book.title
    };
  });
  console.log(JSON.stringify({
    legacy,
    mappings,
    summary: {
      ambiguous: mappings.filter((item) => item.legacyMatches.length > 1).length,
      apiBooks: mappings.length,
      exactMapped: mappings.filter((item) => item.legacyMatches.length === 1).length,
      unmapped: mappings.filter((item) => item.legacyMatches.length === 0).length
    }
  }, null, 2));
} finally {
  sqlite.close();
}

function normalizeTitle(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN')
    .replace(/[：:]/gu, '').replace(/\s+/gu, ' ').trim();
}

function body(row: NodeRow) {
  return requireResolvedNodeBody(row, row.id).content;
}

function generatedDepthFirst(rootId: string) {
  const rows = driver.queryAll<NodeRow>(`WITH RECURSIVE tree AS (
      SELECT * FROM nodes WHERE parent_id = ? AND deleted_at IS NULL AND id LIKE 'node-epub-%'
      UNION ALL
      SELECT child.* FROM nodes child JOIN tree ON child.parent_id = tree.id
      WHERE child.deleted_at IS NULL AND child.id LIKE 'node-epub-%'
    ) SELECT tree.*, cbd.data body_blob_data, node_order.position tree_position
    FROM tree LEFT JOIN content_blob_data cbd ON cbd.hash = tree.body_blob_hash
    LEFT JOIN node_order ON node_order.node_id = tree.id`, [rootId]);
  const children = new Map<string, NodeRow[]>();
  rows.forEach((row) => {
    const siblings = children.get(row.parent_id ?? '') ?? [];
    siblings.push(row);
    children.set(row.parent_id ?? '', siblings);
  });
  children.forEach((siblings) => siblings.sort((left, right) => (
    (left.tree_position ?? left.position ?? Number.MAX_SAFE_INTEGER)
      - (right.tree_position ?? right.position ?? Number.MAX_SAFE_INTEGER)
    || left.created_at.localeCompare(right.created_at)
    || left.id.localeCompare(right.id)
  )));
  const result: NodeRow[] = [];
  const visit = (parentId: string) => {
    for (const child of children.get(parentId) ?? []) {
      result.push(child);
      visit(child.id);
    }
  };
  visit(rootId);
  return result;
}
