import { createRequire } from 'node:module';
import path from 'node:path';

import { parseStoredAnchorLink, type StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import { decodeTextBodyBlobData } from '../../lib/core/database/contentBodyBlobs.js';
import { parseManualChildOrder } from '../../lib/core/nodes/manualChildOrder.js';
import {
  DEMO_PACK_CONTRACT_VERSION,
  DEMO_SOURCE_LOCALE_DEFAULT,
  DEMO_TRANSLATABLE_FIELDS,
  type DemoPack,
  type DemoPackBlock,
  type DemoPackHighlight,
  type DemoPackReviewItem
} from '../../src/demo/demoPack.js';

import type { ExportArgs, NodeRow, WarningRow } from './demo-pack-export-types.js';
import { createDemoReadingSeed, createDemoReviewScheduleSeed } from './demo-pack-schedule-seeds.js';
import { writeDemoPack } from './write-demo-pack.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

const DEFAULT_DB_PATH = 'D:\\X\\U\\Foliole\\Data\\foliole.db';
const DEFAULT_OUTPUT_PATH = 'src/demo/generated/demoPack.ts';

export function parseExportArgs(argv: string[]): ExportArgs {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) throw new Error(`Invalid argument: ${name ?? ''}`);
    flags.set(name.slice(2), value);
    index += 1;
  }
  const rootId = flags.get('root-id');
  const rootTitle = flags.get('root-title');
  if (Boolean(rootId) === Boolean(rootTitle)) throw new Error('Provide exactly one of --root-id or --root-title.');
  return {
    dbPath: flags.get('db-path') ?? DEFAULT_DB_PATH,
    outputPath: flags.get('output') ?? DEFAULT_OUTPUT_PATH,
    sourceLocale: flags.get('source-locale') ?? DEMO_SOURCE_LOCALE_DEFAULT,
    ...(rootId ? { rootId } : {}),
    ...(rootTitle ? { rootTitle } : {})
  };
}

export async function exportDemoPack(args: ExportArgs) {
  const db = new BetterSqlite3(args.dbPath, { readonly: true, fileMustExist: true });
  try {
    const root = resolveRoot(db, args);
    const rows = queryVisibleSubtreeRows(db, root.id);
    const warnings = querySkippedDescendants(db, root.id).map((row) => `${row.reason}: ${row.title} (${row.id})`);
    const pack = buildDemoPack(root, rows, warnings, args.sourceLocale ?? DEMO_SOURCE_LOCALE_DEFAULT);
    await writeDemoPack(args.outputPath, pack);
    return pack;
  } finally {
    db.close();
  }
}

function resolveRoot(db: import('better-sqlite3').Database, args: ExportArgs) {
  const rows = args.rootId
    ? db.prepare('SELECT id, title FROM nodes WHERE id = ? AND deleted_at IS NULL').all(args.rootId)
    : db.prepare('SELECT id, title FROM nodes WHERE title = ? AND deleted_at IS NULL ORDER BY id').all(args.rootTitle);
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one Demo root, found ${rows.length}.`);
  }
  return rows[0] as { id: string; title: string };
}

function queryVisibleSubtreeRows(db: import('better-sqlite3').Database, rootId: string) {
  return db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT id FROM nodes
      WHERE id = ? AND deleted_at IS NULL AND virtual_filter IS NULL AND shelved_at IS NULL
      UNION ALL
      SELECT child.id FROM nodes child
      JOIN subtree parent ON parent.id = child.parent_id
      WHERE child.deleted_at IS NULL AND child.virtual_filter IS NULL AND child.shelved_at IS NULL
    )
    SELECT n.id, n.parent_id, n.kind, n.title, n.content, n.opening_text, n.reveal,
      n.anchor_link, n.manual_child_order, n.created_at, cbd.data AS body_blob_data
    FROM nodes n
    JOIN subtree s ON s.id = n.id
    LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
  `).all(rootId) as NodeRow[];
}

function querySkippedDescendants(db: import('better-sqlite3').Database, rootId: string) {
  return db.prepare(`
    WITH RECURSIVE subtree(id) AS (
      SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL
      UNION ALL
      SELECT child.id FROM nodes child
      JOIN subtree parent ON parent.id = child.parent_id
      WHERE child.deleted_at IS NULL
    )
    SELECT id, title,
      CASE WHEN virtual_filter IS NOT NULL THEN 'virtual' ELSE 'shelved' END AS reason
    FROM nodes
    WHERE id IN (SELECT id FROM subtree) AND (virtual_filter IS NOT NULL OR shelved_at IS NOT NULL)
    ORDER BY title, id
  `).all(rootId) as WarningRow[];
}

function buildDemoPack(root: { id: string; title: string }, rows: NodeRow[], warnings: string[], sourceLocale: string): DemoPack {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const rootRow = byId.get(root.id);
  if (!rootRow) throw new Error('Demo root is not exportable.');
  const childIds = buildOrderedChildIds(rows);
  const topics = orderedDescendants(root.id, childIds)
    .map((id) => byId.get(id))
    .filter((row): row is NodeRow => Boolean(row && isPublishTopic(row)))
    .map((topic, index) => buildTopic(topic, index, childIds, byId, warnings));
  if (!topics.length) throw new Error('Demo root does not contain publishable topics.');
  return {
    contractVersion: DEMO_PACK_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    sourceLocale,
    translatableFields: DEMO_TRANSLATABLE_FIELDS,
    source: { rootNodeId: root.id, rootTitle: root.title, warnings },
    topics
  };
}

function buildOrderedChildIds(rows: NodeRow[]) {
  const children = new Map<string | null, NodeRow[]>();
  rows.forEach((row) => children.set(row.parent_id, [...(children.get(row.parent_id) ?? []), row]));
  const result = new Map<string, string[]>();
  rows.forEach((parent) => {
    const manual = parseManualChildOrder(parent.manual_child_order) ?? [];
    const childRows = children.get(parent.id) ?? [];
    const manualIndex = new Map(manual.map((id, index) => [id, index]));
    result.set(parent.id, childRows.sort((left, right) => {
      const leftIndex = manualIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = manualIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return `${left.created_at}:${left.id}`.localeCompare(`${right.created_at}:${right.id}`);
    }).map((row) => row.id));
  });
  return result;
}

function orderedDescendants(parentId: string, childIds: Map<string, string[]>): string[] {
  return (childIds.get(parentId) ?? []).flatMap((id) => [id, ...orderedDescendants(id, childIds)]);
}

function isPublishTopic(row: NodeRow) {
  return row.kind === 'topic' && parseStoredAnchorLink(row.anchor_link)?.kind !== 'highlight';
}

function buildTopic(topic: NodeRow, index: number, childIds: Map<string, string[]>, byId: Map<string, NodeRow>, warnings: string[]) {
  const children = (childIds.get(topic.id) ?? []).map((id) => byId.get(id)).filter((row): row is NodeRow => Boolean(row));
  const content = decodeTextBodyBlobData(topic.body_blob_data) ?? topic.content;
  const slug = uniqueSlug(topic.title, topic.id, index);
  const reviewItems = children.flatMap(reviewItemFromNode);
  return {
    id: topic.id,
    slug,
    title: topic.title,
    description: topic.opening_text ?? firstParagraph(content) ?? topic.title,
    summary: firstParagraph(content) ?? topic.opening_text ?? topic.title,
    runtime: { state: 'topic' as const, topicId: topic.id },
    readingSeed: createDemoReadingSeed(index),
    blocks: markdownBlocks(slug, content, topic.title),
    highlights: children.flatMap((child) => highlightFromNode(child, warnings)),
    reviewItems,
    reviewScheduleSeeds: reviewItems.map((item, itemIndex) => createDemoReviewScheduleSeed(item.id, index + itemIndex + 1))
  };
}

function highlightFromNode(row: NodeRow, warnings: string[]): DemoPackHighlight[] {
  const anchor = parseStoredAnchorLink(row.anchor_link);
  if (anchor?.kind !== 'highlight') return [];
  const locator = textLocator(anchor);
  if (!locator) {
    warnings.push(`non-text-anchor: ${row.title} (${row.id})`);
    return [];
  }
  return [{ id: row.id, title: row.title, excerpt: row.title || locatorText(locator), locator }];
}

function reviewItemFromNode(row: NodeRow): DemoPackReviewItem[] {
  if (row.kind !== 'item') return [];
  return [{ id: row.id, title: row.title, kind: row.reveal ? 'cloze' : 'item', prompt: row.content, answer: row.reveal }];
}

function textLocator(anchor: StoredAnchorLink) {
  const locator = anchor.locator;
  if (!locator) return null;
  if ('ranges' in locator) return locator;
  return 'from' in locator && 'to' in locator && 'originalText' in locator ? locator : null;
}

function locatorText(locator: DemoPackHighlight['locator']) {
  return 'ranges' in locator ? locator.ranges.map((range) => range.originalText).join(' ') : locator.originalText;
}

function firstParagraph(content: string) {
  return content.split(/\n{2,}/).map((part) => part.trim()).find(Boolean) ?? null;
}

function markdownBlocks(slug: string, content: string, fallbackTitle: string): DemoPackBlock[] {
  const blocks = content.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const source = blocks.length ? blocks : [fallbackTitle];
  return source.map((text, index) => ({
    id: `${slug}-block-${index + 1}`,
    kind: /^#{1,3}\s+/.test(text) ? 'heading' : 'paragraph',
    text: text.replace(/^#{1,3}\s+/, '')
  }));
}

function uniqueSlug(title: string, id: string, index: number) {
  const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return base || `topic-${index + 1}-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/demo/export-demo-pack.ts')) {
  exportDemoPack(parseExportArgs(process.argv.slice(2))).catch((error) => {
    console.error(`[demo:export] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
