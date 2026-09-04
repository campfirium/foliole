import { createHash } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';

import { resolveRecoveryAnchors, type RecoveryAnchor } from './readwise-body-recovery-anchors.js';

interface ArticleRow extends NodeBodyRow {
  [column: string]: unknown;
  current_version_id: string | null;
  id: string;
  source_fingerprint: string;
  source_locator: string;
  title: string;
}

interface VersionRow {
  [column: string]: unknown;
  body_text: string;
  created_at: string;
  version_id: string;
}

export interface RecoveryCandidate {
  anchors: RecoveryAnchor[];
  currentBytes: number;
  currentHash: string | null;
  nodeId: string;
  recoveryBytes: number;
  recoveryContent: string;
  recoveryCreatedAt: string;
  recoveryVersionId: string;
  reason: 'frontmatter_only_with_longer_history';
  sourceFingerprint: string;
  sourceLocator: string;
  title: string;
}

export interface RecoveryPlan {
  apply: RecoveryCandidate[];
  generatedAt: string;
  manualReview: Array<{ nodeId: string; reason: string; title: string }>;
  noRepair: Array<{ nodeId: string; reason: string; title: string }>;
  planHash: string;
}

export function isFrontmatterOnly(content: string) {
  const normalized = content.replace(/\r\n?/g, '\n');
  const match = /^---\n[\s\S]*?\n---(?:\n+|$)/.exec(normalized);
  return Boolean(match && normalized.slice(match[0].length).trim() === '');
}

function readArticles(driver: DatabaseDriver) {
  return driver.queryAll<ArticleRow>(
    `SELECT n.id, n.title, n.content, n.body_blob_hash, cbd.data AS body_blob_data,
            n.current_version_id, s.source_fingerprint, s.source_locator
     FROM import_sources s JOIN nodes n ON n.id = s.latest_node_id
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE s.provider = 'desktop_text_file' AND s.source_kind = 'markdown'
       AND replace(s.source_locator, '\\', '/') LIKE '%/Full Document Contents/Articles/%'
       AND n.deleted_at IS NULL ORDER BY n.id`
  );
}

function recoveryVersion(driver: DatabaseDriver, nodeId: string, currentContent: string) {
  return driver.queryAll<VersionRow>(
    `SELECT version_id, created_at, body_text FROM node_sync_versions
     WHERE object_id = ? AND body_text IS NOT NULL
     ORDER BY created_at DESC, version_id DESC`, [nodeId]
  ).find((row) => Buffer.byteLength(row.body_text, 'utf8') > Buffer.byteLength(currentContent, 'utf8') &&
    !isFrontmatterOnly(row.body_text)) ?? null;
}

function stablePlanPayload(plan: Omit<RecoveryPlan, 'generatedAt' | 'planHash'>) {
  return plan.apply.map((item) => ({
    anchors: item.anchors, currentBytes: item.currentBytes, currentHash: item.currentHash,
    nodeId: item.nodeId, recoveryBytes: item.recoveryBytes, recoveryContent: item.recoveryContent,
    recoveryCreatedAt: item.recoveryCreatedAt, recoveryVersionId: item.recoveryVersionId,
    reason: item.reason, sourceFingerprint: item.sourceFingerprint
  }));
}

export function buildRecoveryPlan(driver: DatabaseDriver, generatedAt = new Date().toISOString()): RecoveryPlan {
  const partial: Omit<RecoveryPlan, 'generatedAt' | 'planHash'> = { apply: [], manualReview: [], noRepair: [] };
  for (const row of readArticles(driver)) {
    const body = resolveNodeBody(row);
    if (body.status === 'unavailable') {
      partial.manualReview.push({ nodeId: row.id, reason: 'current_body_unavailable', title: row.title });
      continue;
    }
    if (!isFrontmatterOnly(body.content)) {
      const history = recoveryVersion(driver, row.id, body.content);
      partial[history ? 'manualReview' : 'noRepair'].push({
        nodeId: row.id, reason: history ? 'non_frontmatter_only_history_is_longer' : 'current_body_not_damaged', title: row.title
      });
      continue;
    }
    const version = recoveryVersion(driver, row.id, body.content);
    if (!version) {
      partial.manualReview.push({ nodeId: row.id, reason: 'no_eligible_history', title: row.title });
      continue;
    }
    const anchorResult = resolveRecoveryAnchors(driver, row.id, version.body_text);
    if (anchorResult.reason) {
      partial.manualReview.push({ nodeId: row.id, reason: anchorResult.reason, title: row.title });
      continue;
    }
    partial.apply.push({ anchors: anchorResult.anchors, currentBytes: Buffer.byteLength(body.content, 'utf8'),
      currentHash: body.bodyBlobHash, nodeId: row.id, recoveryBytes: Buffer.byteLength(version.body_text, 'utf8'),
      recoveryContent: version.body_text, recoveryCreatedAt: version.created_at, recoveryVersionId: version.version_id,
      reason: 'frontmatter_only_with_longer_history', sourceFingerprint: row.source_fingerprint,
      sourceLocator: row.source_locator, title: row.title });
  }
  const planHash = createHash('sha256').update(JSON.stringify(stablePlanPayload(partial))).digest('hex');
  return { ...partial, generatedAt, planHash };
}
