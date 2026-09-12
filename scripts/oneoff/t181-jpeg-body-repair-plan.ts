import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { resolveNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import { classifyAttachmentBytes } from '../../lib/platform/attachmentByteClassification.js';

import type {
  JpegBodyRepairCandidate,
  JpegBodyRepairInvariants,
  JpegBodyRepairPlan
} from './t181-jpeg-body-repair-types.js';

const JPEG_ASSET = /asset:\/\/([a-f0-9]{64})\.jpeg(?=$|[^a-zA-Z0-9._-])/g;
const SYNC_TABLES = ['sync_groups', 'sync_group_local_state', 'sync_group_members', 'sync_group_devices'];

interface NodeRow extends NodeBodyRow {
  current_version_id: string | null;
  id: string;
  updated_at: string;
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stableRows(rows: DatabaseRow[]) {
  return rows.map((row) => JSON.stringify(row)).sort();
}

function tableRows(driver: DatabaseDriver, table: string) {
  const exists = driver.queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]
  );
  if (!exists) return [];
  return stableRows(driver.queryAll(`SELECT * FROM ${table} ORDER BY rowid`));
}

export function captureSyncGroupDigest(driver: DatabaseDriver) {
  const settings = driver.queryAll(
    "SELECT * FROM settings WHERE key = 'sync_group_last_trigger_result' ORDER BY key"
  );
  return digest({ settings: stableRows(settings), tables: SYNC_TABLES.map((table) => [table, tableRows(driver, table)]) });
}

function readNodes(driver: DatabaseDriver) {
  return driver.queryAll<NodeRow>(
    `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data,
            n.current_version_id, n.updated_at
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.deleted_at IS NULL
     ORDER BY n.id`
  );
}

function jpegKeys(content: string) {
  return [...content.matchAll(JPEG_ASSET)].map((match) => `${match[1]}.jpeg`);
}

async function assertCanonicalJpegFiles(assetsDir: string, keys: string[]) {
  for (const jpegKey of new Set(keys)) {
    const hash = jpegKey.slice(0, 64);
    const target = path.join(assetsDir, `${hash}.jpg`);
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`canonical_target_not_regular:${hash}`);
    const bytes = await fs.readFile(target);
    if (classifyAttachmentBytes(bytes) !== 'image/jpeg') throw new Error(`canonical_target_not_jpeg:${hash}`);
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`canonical_target_hash_mismatch:${hash}`);
  }
}

export async function buildJpegBodyRepairPlan(input: {
  assetsDir: string;
  driver: DatabaseDriver;
  expectedNodes?: number;
  expectedTokens?: number;
  generatedAt?: string;
}): Promise<JpegBodyRepairPlan> {
  const candidates: JpegBodyRepairCandidate[] = [];
  for (const row of readNodes(input.driver)) {
    const body = resolveNodeBody(row);
    if (body.status === 'unavailable') throw new Error(`node_body_unavailable:${row.id}`);
    const keys = jpegKeys(body.content);
    if (!keys.length) continue;
    candidates.push({
      bodyHash: body.bodyBlobHash,
      currentVersionId: row.current_version_id,
      jpegKeys: keys,
      nextContent: body.content.replace(JPEG_ASSET, 'asset://$1.jpg'),
      nodeId: row.id,
      previousContent: body.content,
      updatedAt: row.updated_at
    });
  }
  const tokenCount = candidates.reduce((count, candidate) => count + candidate.jpegKeys.length, 0);
  if (candidates.length !== (input.expectedNodes ?? 19) || tokenCount !== (input.expectedTokens ?? 36)) {
    throw new Error(`repair_scope_mismatch:nodes=${candidates.length}:tokens=${tokenCount}`);
  }
  await assertCanonicalJpegFiles(input.assetsDir, candidates.flatMap((candidate) => candidate.jpegKeys));
  const syncGroupDigest = captureSyncGroupDigest(input.driver);
  const stable = candidates.map((candidate) => ({
    bodyHash: candidate.bodyHash, currentVersionId: candidate.currentVersionId,
    jpegKeys: candidate.jpegKeys, nextHash: digest(candidate.nextContent), nodeId: candidate.nodeId,
    previousHash: digest(candidate.previousContent), updatedAt: candidate.updatedAt
  }));
  return {
    candidates, generatedAt: input.generatedAt ?? new Date().toISOString(),
    planHash: digest({ candidates: stable, syncGroupDigest, tokenCount }), syncGroupDigest, tokenCount
  };
}

export async function captureJpegBodyRepairInvariants(input: {
  assetsDir: string;
  driver: DatabaseDriver;
  targetIds: string[];
}): Promise<JpegBodyRepairInvariants> {
  const placeholders = input.targetIds.map(() => '?').join(', ');
  const assets = await Promise.all((await fs.readdir(input.assetsDir)).sort().map(async (name) => {
    const stat = await fs.lstat(path.join(input.assetsDir, name));
    return { isFile: stat.isFile(), isSymbolicLink: stat.isSymbolicLink(), mode: stat.mode, name, size: stat.size };
  }));
  const attachmentTables = ['attachments', 'attachment_blobs', 'node_attachments'];
  const nonTarget = input.driver.queryAll(
    `SELECT * FROM nodes WHERE id NOT IN (${placeholders}) ORDER BY id`, input.targetIds
  );
  const targetProtected = input.driver.queryAll(
    `SELECT id, parent_id, kind, priority, desired_retention, enable_short_term,
            sequential_reading_enabled, shelved_at, manual_child_order, title, is_title_manual,
            hide_title_heading, virtual_filter, reveal, anchor_link, image_regions, position,
            created_at, deleted_at, import_source_fingerprint, import_content_fingerprint
     FROM nodes WHERE id IN (${placeholders}) ORDER BY id`, input.targetIds
  );
  return {
    assetsDigest: digest(assets),
    attachmentFactsDigest: digest(attachmentTables.map((table) => [table, tableRows(input.driver, table)])),
    nonTargetNodesDigest: digest(stableRows(nonTarget)),
    syncGroupDigest: captureSyncGroupDigest(input.driver),
    targetProtectedDigest: digest(stableRows(targetProtected))
  };
}
