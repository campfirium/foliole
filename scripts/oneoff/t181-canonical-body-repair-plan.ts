import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { remapRawStoredAnchorLink } from '../../lib/core/database/storedAnchorLinkRemap.js';
import { classifyAttachmentBytes } from '../../lib/platform/attachmentByteClassification.js';
import { buildCanonicalAttachmentKey } from '../../lib/platform/canonicalAttachmentKey.js';

import { captureSyncGroupDigest } from './t181-jpeg-body-repair-plan.js';

const ADDRESS = /asset:\/\/([a-f0-9]{64})\.jpeg(?=$|[^a-zA-Z0-9._-])/g;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export interface RepairChild {
  afterAnchor: string;
  afterRegions: string | null;
  beforeAnchor: string;
  beforeRegions: string | null;
  currentVersionId: string | null;
  nodeId: string;
  rowDigest: string;
  updatedAt: string;
}

export interface RepairCandidate {
  anchorSnapshotDigest: string;
  afterBody: string;
  beforeBody: string;
  bodyBlobHash: string | null;
  children: RepairChild[];
  currentVersionId: string | null;
  mappings: Array<{ canonicalKey: string; previousKey: string }>;
  nodeId: string;
  rowDigest: string;
  updatedAt: string;
}

export interface RepairPlan {
  candidates: RepairCandidate[];
  planHash: string;
  syncGroupDigest: string;
  tokenCount: number;
}

interface ParentRow extends NodeBodyRow {
  current_version_id: string | null;
  id: string;
  updated_at: string;
}

interface ChildRow extends DatabaseRow {
  anchor_link: string;
  current_version_id: string | null;
  id: string;
  image_regions: string | null;
  updated_at: string;
}

export function hashValue(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function countJpegBodyAddresses(body: string) {
  return [...body.matchAll(ADDRESS)].length;
}

function readActiveNodes(driver: DatabaseDriver) {
  return driver.queryAll<ParentRow>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data,
            n.current_version_id, n.updated_at
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.deleted_at IS NULL ORDER BY n.id`
  );
}

export function captureChildAnchorRows(driver: DatabaseDriver, nodeId: string) {
  return driver.queryAll<ChildRow>(
    `SELECT id, anchor_link, image_regions, current_version_id, updated_at
     FROM nodes WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL ORDER BY id`,
    [nodeId]
  );
}

export function captureNodeRowDigest(driver: DatabaseDriver, nodeId: string) {
  return hashValue(driver.queryOne('SELECT * FROM nodes WHERE id = ?', [nodeId]));
}

function expectedChildren(driver: DatabaseDriver, rows: ChildRow[], before: string, after: string) {
  return rows.flatMap((row) => {
    const result = remapRawStoredAnchorLink({
      imageRegions: row.image_regions, nextContent: after,
      previousContent: before, value: row.anchor_link
    });
    if (!('value' in result)) throw new Error(`anchor_remap_unavailable:${row.id}:${result.reason}`);
    if (result.value === row.anchor_link && result.imageRegions === row.image_regions) return [];
    return [{
      afterAnchor: result.value, afterRegions: result.imageRegions,
      beforeAnchor: row.anchor_link, beforeRegions: row.image_regions,
      currentVersionId: row.current_version_id, nodeId: row.id,
      rowDigest: captureNodeRowDigest(driver, row.id), updatedAt: row.updated_at
    }];
  });
}

async function canonicalKeyForHash(assetsDir: string, names: string[], hash: string) {
  const matches = names.filter((name) => name.startsWith(`${hash}.`));
  if (matches.length !== 1) throw new Error(`canonical_target_count:${hash}:${matches.length}`);
  const name = matches[0]!;
  const target = path.join(assetsDir, name);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`canonical_target_not_regular:${hash}`);
  const bytes = await fs.readFile(target);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== hash) throw new Error(`canonical_target_hash_mismatch:${hash}`);
  const mime = classifyAttachmentBytes(bytes);
  if (!IMAGE_MIMES.has(mime)) throw new Error(`canonical_target_not_image:${hash}:${mime}`);
  if (buildCanonicalAttachmentKey(hash, mime) !== name) throw new Error(`canonical_target_extension_mismatch:${hash}`);
  return name;
}

export async function buildCanonicalBodyRepairPlan(input: {
  assetsDir: string;
  driver: DatabaseDriver;
  expectedNodes?: number;
  expectedTokens?: number;
}) {
  const names = await fs.readdir(input.assetsDir);
  const candidates: RepairCandidate[] = [];
  for (const row of readActiveNodes(input.driver)) {
    const body = resolveNodeBody(row);
    if (body.status === 'unavailable') throw new Error(`node_body_unavailable:${row.id}`);
    const matches = [...body.content.matchAll(ADDRESS)];
    if (!matches.length) continue;
    const mappings = [] as RepairCandidate['mappings'];
    for (const match of matches) {
      const hash = match[1]!;
      mappings.push({
        canonicalKey: await canonicalKeyForHash(input.assetsDir, names, hash),
        previousKey: `${hash}.jpeg`
      });
    }
    let index = 0;
    const afterBody = body.content.replace(ADDRESS, () => `asset://${mappings[index++]!.canonicalKey}`);
    const anchorRows = captureChildAnchorRows(input.driver, row.id);
    candidates.push({
      anchorSnapshotDigest: hashValue(anchorRows), afterBody, beforeBody: body.content,
      bodyBlobHash: body.bodyBlobHash,
      children: expectedChildren(input.driver, anchorRows, body.content, afterBody),
      currentVersionId: row.current_version_id, mappings, nodeId: row.id,
      rowDigest: captureNodeRowDigest(input.driver, row.id), updatedAt: row.updated_at
    });
  }
  const tokenCount = candidates.reduce((count, item) => count + item.mappings.length, 0);
  if (input.expectedNodes !== undefined && candidates.length !== input.expectedNodes) {
    throw new Error(`repair_scope_nodes:${candidates.length}`);
  }
  if (input.expectedTokens !== undefined && tokenCount !== input.expectedTokens) {
    throw new Error(`repair_scope_tokens:${tokenCount}`);
  }
  const syncGroupDigest = captureSyncGroupDigest(input.driver);
  const frozen = candidates.map((item) => ({
    nodeId: item.nodeId, bodyBlobHash: item.bodyBlobHash,
    anchorSnapshotDigest: item.anchorSnapshotDigest, rowDigest: item.rowDigest,
    beforeBodyHash: hashValue(item.beforeBody), afterBodyHash: hashValue(item.afterBody),
    currentVersionId: item.currentVersionId, updatedAt: item.updatedAt,
    mappings: item.mappings, children: item.children.map((child) => ({
      nodeId: child.nodeId, beforeAnchorHash: hashValue(child.beforeAnchor),
      afterAnchorHash: hashValue(child.afterAnchor), beforeRegionsHash: hashValue(child.beforeRegions),
      afterRegionsHash: hashValue(child.afterRegions), currentVersionId: child.currentVersionId,
      rowDigest: child.rowDigest,
      updatedAt: child.updatedAt
    }))
  }));
  return { candidates, planHash: hashValue({ frozen, syncGroupDigest, tokenCount }),
    syncGroupDigest, tokenCount } satisfies RepairPlan;
}

export function safePlanSummary(plan: RepairPlan) {
  return {
    nodeCount: plan.candidates.length, tokenCount: plan.tokenCount,
    childCount: plan.candidates.reduce((count, item) => count + item.children.length, 0),
    planHash: plan.planHash,
    candidates: plan.candidates.map((item) => ({
      nodeId: item.nodeId, beforeBodyHash: hashValue(item.beforeBody),
      afterBodyHash: hashValue(item.afterBody), currentVersionId: item.currentVersionId,
      updatedAt: item.updatedAt, mappings: item.mappings,
      anchorSnapshotDigest: item.anchorSnapshotDigest, rowDigest: item.rowDigest,
      children: item.children.map((child) => ({ nodeId: child.nodeId,
        beforeAnchorHash: hashValue(child.beforeAnchor), afterAnchorHash: hashValue(child.afterAnchor),
        currentVersionId: child.currentVersionId, rowDigest: child.rowDigest,
        updatedAt: child.updatedAt }))
    }))
  };
}
