import { initializeReceivedReviewSchedule } from '../database/initialReviewSchedule.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';
import { recomputeNodeReviewWithDb } from '../database/reviewProjection.js';
import { hashTextBody } from '../database/textBodyHash.js';
import type { DbPort, DbRow, DbValue } from '../sync/dbPort.js';
import { alternativeImageFacts } from '../sync/topicAlternativeConflict.js';
import { settleTopicAlternatives, writeTopicAlternative } from '../sync/topicAlternativeStore.js';
import { alternativeForBodyHash } from '../sync/topicTextState.js';

import { collectArticleImageStorageKeys } from './replaceArticleImageSource.js';

/**
 * Merging another library brings its current bodies and its whole review history into this one. Versions,
 * settings and sync state stay behind. Every rule is idempotent, so running the same source again after an
 * interruption only adds what is still missing.
 */

/** One visible node of the source library, as its `nodes` row stores it. */
export type LibraryMergeSourceNode = DbRow & {
  id: string; parent_id: string | null; kind: string; title: string; content: string;
  current_version_id: string | null; resource_references: string | null; image_sources: string | null;
  initial_review_due: string | null; created_at: string; updated_at: string; last_modified_by_host_name: string | null;
};

export type LibraryMergeDecision = 'new' | 'same' | 'known' | 'deleted' | 'alternative';

export interface LibraryMergeReport {
  added: number;
  alternatives: number;
  alternativesChanged: boolean;
  unchanged: number;
  skippedDeleted: number;
  reviewsAdded: number;
  /** Source attachments still referenced by the target notes or their available alternatives. */
  attachmentKeys: string[];
}

export interface LibraryMergeHost {
  /** The folder an earlier run of the same source made, if it is still there. */
  findFolder(tx: DbPort): Promise<string | null>;
  /** The folder new top-level nodes go under; the same source reuses the same folder on a rerun. */
  ensureFolder(tx: DbPort): Promise<string>;
  /** Stores a new node through the host's own local write path, keeping the source id. */
  createNode(tx: DbPort, node: LibraryMergeSourceNode, parentId: string): Promise<void>;
  /** Gives the host a chance to breathe between batches. */
  betweenBatches?: () => Promise<void>;
}

const SPECIAL_NODE_PREFIX = 'special-';

// Visible nodes: every ancestor exists and none is deleted. Special nodes are containers, never merged.
const SOURCE_OUTLINE_SQL = `WITH RECURSIVE visible(id, parent_id, depth) AS (
  SELECT id, parent_id, 0 FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL
  UNION ALL SELECT n.id, n.parent_id, visible.depth + 1 FROM nodes n JOIN visible ON n.parent_id = visible.id
  WHERE n.deleted_at IS NULL AND visible.depth < 100000
) SELECT visible.id, visible.parent_id, visible.depth FROM visible JOIN nodes n ON n.id = visible.id
  WHERE n.virtual_filter IS NULL ORDER BY visible.depth, visible.id`;

const TARGET_FACTS_SQL = `SELECT q.id, n.id AS node_id, n.deleted_at, n.content, n.resource_references,
  (SELECT COUNT(*) FROM node_text_alternatives a WHERE a.node_id = n.id AND a.status = 'available') AS available_alternatives,
  EXISTS (SELECT 1 FROM node_sync_tombstones t WHERE t.node_id = q.id) AS tombstoned,
  (? IS NOT NULL AND EXISTS (SELECT 1 FROM node_sync_versions v WHERE v.version_id = ?)) AS known
  FROM (SELECT ? AS id) q LEFT JOIN nodes n ON n.id = q.id`;

type MergeDecisionFacts = { node_id: string | null; deleted_at: string | null; content: string | null; tombstoned: number; known: number };
type TargetFacts = MergeDecisionFacts & { resource_references: string | null; available_alternatives: number };

export function decideLibraryMergeNode(source: Pick<LibraryMergeSourceNode, 'content'>, target: MergeDecisionFacts): LibraryMergeDecision {
  if (!target.node_id) return target.tombstoned ? 'deleted' : 'new';
  if (target.deleted_at || target.tombstoned) return 'deleted';
  if (target.content === source.content) return 'same';
  if (target.known) return 'known';
  return 'alternative';
}

async function readTargetFacts(tx: DbPort, node: LibraryMergeSourceNode) {
  const [row] = await tx.query<TargetFacts>(TARGET_FACTS_SQL, [node.current_version_id, node.current_version_id, node.id]);
  return row!;
}

/** Whether `nodeId` lies inside the merge folder, so a rerun keeps placing children under their own parent. */
async function insideFolder(tx: DbPort, nodeId: string, folderId: string) {
  const [row] = await tx.query<{ inside: number }>(`WITH RECURSIVE up(id, depth) AS (
    SELECT parent_id, 0 FROM nodes WHERE id = ? AND deleted_at IS NULL
    UNION ALL SELECT n.parent_id, up.depth + 1 FROM nodes n JOIN up ON n.id = up.id
    WHERE n.deleted_at IS NULL AND up.depth < 100000
  ) SELECT EXISTS (SELECT 1 FROM up WHERE id = ?) AS inside`, [nodeId, folderId]);
  return Boolean(row?.inside);
}

type AttachmentReferences = { content: string; resource_references: string | null };

function nodeAttachmentKeys(node: AttachmentReferences) {
  const keys = new Set(parseNodeResourceReferences(node.resource_references).map(row => row.storage_key));
  for (const key of collectArticleImageStorageKeys(node.content)) keys.add(key);
  return keys;
}

async function collectRetainedAttachmentKeys(
  tx: DbPort, node: LibraryMergeSourceNode, target: TargetFacts, now: string, keys: Set<string>
) {
  const sourceKeys = nodeAttachmentKeys(node);
  if (sourceKeys.size === 0) return;
  const currentKeys = nodeAttachmentKeys({ content: target.content ?? '', resource_references: target.resource_references });
  for (const key of currentKeys) if (sourceKeys.delete(key)) keys.add(key);
  if (sourceKeys.size === 0) return;

  const alternatives = await tx.query<AttachmentReferences>(`SELECT body_text AS content, resource_references
    FROM node_text_alternatives WHERE node_id = ? AND status = 'available' AND expires_at > ?`, [node.id, now]);
  for (const alternative of alternatives) {
    for (const key of nodeAttachmentKeys(alternative)) if (sourceKeys.has(key)) keys.add(key);
  }
}

/** Adds the source body as an alternative once; a rerun leaves an existing one, even a dismissed one, alone. */
async function writeAlternative(tx: DbPort, node: LibraryMergeSourceNode, now: string) {
  const versionId = node.current_version_id ?? `library-merge:${node.id}`;
  const hash = hashTextBody(node.content);
  const entry = alternativeForBodyHash({ object_id: node.id, version_id: versionId,
    host_name: node.last_modified_by_host_name ?? 'unknown', version_created_at: node.updated_at,
    snapshot: {} } as Parameters<typeof alternativeForBodyHash>[0], hash, now);
  const [existing] = await tx.query('SELECT 1 FROM node_text_alternatives WHERE alternative_id = ?', [entry.id]);
  if (existing) return null;
  await writeTopicAlternative(tx, { alternative_id: entry.id, node_id: node.id, source_version_id: versionId,
    body_text: node.content, body_blob_hash: hash, source_host_name: entry.source_host_name,
    created_at: entry.created_at, expires_at: entry.expires_at, status: 'available', updated_at: now,
    ...alternativeImageFacts({ snapshot: { resource_references: node.resource_references ?? '[]',
      image_sources: node.image_sources } } as Parameters<typeof alternativeImageFacts>[0], node.content) }, true);
  return entry.id;
}

async function mergeAlternatives(tx: DbPort, node: LibraryMergeSourceNode, target: TargetFacts,
  decision: LibraryMergeDecision, now: string
) {
  const newId = decision === 'alternative' ? await writeAlternative(tx, node, now) : null;
  if (!newId && !target.available_alternatives) return { added: false, changed: false };
  const retained = await settleTopicAlternatives(tx, node.id, hashTextBody(target.content ?? ''), now);
  return {
    added: newId !== null && retained.some(entry => entry.id === newId),
    changed: newId !== null || retained.length !== target.available_alternatives
  };
}

/** Adds the source's review events this library lacks; the same review is the same `op_id` on every device. */
async function mergeReviewLog(source: DbPort, tx: DbPort, nodeId: string) {
  const rows = await source.query<DbRow>(`SELECT id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
    kind, voids_op_id FROM review_log WHERE node_id = ? ORDER BY reviewed_at, op_id`, [nodeId]);
  let added = 0;
  for (const row of rows) {
    const result = await tx.run(`INSERT OR IGNORE INTO review_log (id, op_id, host_name, node_id, grade, scheduler_version,
      reviewed_at, kind, voids_op_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [row.id, row.op_id, row.host_name, row.node_id,
      row.grade, row.scheduler_version, row.reviewed_at, row.kind, row.voids_op_id] as DbValue[]);
    added += result.changes;
  }
  return added;
}

export async function runLibraryMerge(input: {
  source: DbPort; target: DbPort; host: LibraryMergeHost; now: string; batchSize?: number;
}): Promise<LibraryMergeReport> {
  const { source, target, host, now } = input;
  const outline = await source.query<{ id: string; parent_id: string | null; depth: number }>(SOURCE_OUTLINE_SQL);
  const nodes = outline.filter(row => !row.id.startsWith(SPECIAL_NODE_PREFIX));
  const report: LibraryMergeReport = { added: 0, alternatives: 0, alternativesChanged: false,
    unchanged: 0, skippedDeleted: 0, reviewsAdded: 0, attachmentKeys: [] };
  const attachmentKeys = new Set<string>();
  // Nodes this run created: a new child of one of them keeps its parent.
  const created = new Set<string>();
  const batchSize = input.batchSize ?? 200;
  for (let start = 0; start < nodes.length; start += batchSize) {
    const ids = nodes.slice(start, start + batchSize).map(row => row.id);
    const rows = await source.query<LibraryMergeSourceNode>(
      `SELECT * FROM nodes WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(ids)]);
    const byId = new Map(rows.map(row => [row.id, row]));
    await target.transaction(async tx => {
      const folderId = await host.findFolder(tx);
      for (const id of ids) {
        const node = byId.get(id);
        if (!node) continue;
        const targetFacts = await readTargetFacts(tx, node);
        const decision = decideLibraryMergeNode(node, targetFacts);
        if (decision === 'deleted') { report.skippedDeleted += 1; continue; }
        if (decision === 'new') {
          const parent = node.parent_id;
          const keepParent = parent !== null && !parent.startsWith(SPECIAL_NODE_PREFIX)
            && (created.has(parent) || (folderId !== null && await insideFolder(tx, parent, folderId)));
          await host.createNode(tx, node, keepParent ? parent : await host.ensureFolder(tx));
          await initializeReceivedReviewSchedule(tx, node.id, node.initial_review_due ?? undefined);
          created.add(node.id);
          report.added += 1;
          for (const key of nodeAttachmentKeys(node)) attachmentKeys.add(key);
        } else {
          const alternative = await mergeAlternatives(tx, node, targetFacts, decision, now);
          if (alternative.added) report.alternatives += 1;
          else report.unchanged += 1;
          report.alternativesChanged ||= alternative.changed;
          await collectRetainedAttachmentKeys(tx, node, targetFacts, now, attachmentKeys);
        }
        const reviews = await mergeReviewLog(source, tx, node.id);
        report.reviewsAdded += reviews;
        if (reviews || (decision === 'new' && node.initial_review_due)) await recomputeNodeReviewWithDb(tx, node.id);
      }
    });
    await host.betweenBatches?.();
  }
  report.attachmentKeys = [...attachmentKeys].sort();
  return report;
}
