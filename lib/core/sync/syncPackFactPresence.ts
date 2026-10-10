import type { DbPort, DbRow } from './dbPort.js';
import { hashText } from './syncNodeResolution.js';
import type { SyncPackReviewLogRecord } from './syncPackReviewLogExecutor.js';

export interface SyncVersionFact {
  body_hash: string | null;
  content_hash: string;
  created_at: string;
  host_name: string;
  object_id: string;
  parent_version_id: string | null;
  snapshot_metadata: string;
  version_id: string;
}

export interface SyncParentFact extends DbRow {
  ordinal: number;
  parent_version_id: string;
  version_id: string;
}

export interface SyncPackFactPage {
  versions: SyncVersionFact[];
  parents: SyncParentFact[];
  reviews: SyncPackReviewLogRecord[];
}

export interface SyncPackFactIndex extends SyncPackFactPage {
  frontier_state_seq: number;
  from_state_seq: number;
  index_id: string;
  round_source_view_id?: string;
  source_epoch: string;
  to_state_seq: number;
}

export interface SyncPackFactClaims {
  versions: string[];
  parents: string[];
  reviews: string[];
}

export interface SyncPackFactClaimBits {
  parents: string;
  reviews: string;
  versions: string;
}

const REVIEW_COLUMNS = [
  'id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version',
  'reviewed_at', 'due_before', 'stability_before', 'difficulty_before',
  'due_after', 'stability_after', 'difficulty_after'
] as const;

export function describeVersionFact(row: {
  body_text: string | null;
  content_hash: string;
  created_at: string;
  host_name: string;
  object_id: string;
  parent_version_id: string | null;
  snapshot_json: string;
  snapshot_metadata?: string;
  version_id: string;
}): SyncVersionFact {
  const snapshot = JSON.parse(row.snapshot_json) as Record<string, unknown>;
  const body = row.body_text ?? (typeof snapshot.content === 'string'
    ? snapshot.content : null);
  const metadata: Record<string, unknown> = row.snapshot_metadata === undefined
    ? snapshot : JSON.parse(row.snapshot_metadata);
  delete metadata.content;
  delete metadata.body_blob_hash;
  delete metadata.text_alternative_bodies;
  delete metadata.body_deleted;
  return {
    body_hash: body === null ? null : hashText(body),
    content_hash: row.content_hash,
    created_at: row.created_at,
    host_name: row.host_name,
    object_id: row.object_id,
    parent_version_id: row.parent_version_id,
    snapshot_metadata: JSON.stringify(metadata),
    version_id: row.version_id
  };
}

export async function probeSyncPackFactPresence(
  port: DbPort,
  page: SyncPackFactPage
): Promise<SyncPackFactClaims> {
  const claims: SyncPackFactClaims = { versions: [], parents: [], reviews: [] };
  for (const fact of page.versions) {
    const [held] = await port.query<Parameters<typeof describeVersionFact>[0]>(
      `SELECT version_id, object_id, parent_version_id, host_name, created_at,
         content_hash, body_text, snapshot_json,
         json_remove(snapshot_json, '$.content') AS snapshot_metadata
       FROM node_sync_versions WHERE version_id = ?`,
      [fact.version_id]
    );
    if (!held) continue;
    const local = describeVersionFact(held);
    if (local.version_id !== fact.version_id || local.object_id !== fact.object_id ||
        local.host_name !== fact.host_name ||
        local.created_at !== fact.created_at || local.content_hash !== fact.content_hash ||
        local.snapshot_metadata !== fact.snapshot_metadata ||
        (fact.body_hash !== null && local.body_hash !== null &&
         fact.body_hash !== local.body_hash)) {
      throw new Error(`sync_pack_node_version_immutable_mismatch:${fact.version_id}`);
    }
    if (local.body_hash !== null) claims.versions.push(fact.version_id);
  }
  for (const fact of page.parents) {
    const rows = await port.query<SyncParentFact>(
      `SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents
       WHERE version_id = ? AND (ordinal = ? OR parent_version_id = ?)`,
      [fact.version_id, fact.ordinal, fact.parent_version_id]
    );
    // A contracted relation must be validated with the complete incoming DAG at apply.
    if (rows.some((row) => row.ordinal === fact.ordinal &&
        row.parent_version_id === fact.parent_version_id)) claims.parents.push(parentFactKey(fact));
  }
  for (const fact of page.reviews) {
    const [held] = await port.query<SyncPackReviewLogRecord>(
      `SELECT ${REVIEW_COLUMNS.join(', ')} FROM review_log WHERE op_id = ?`, [fact.op_id]
    );
    if (!held) continue;
    if (REVIEW_COLUMNS.some((column) => held[column] !== fact[column])) {
      throw new Error(`sync_review_log_op_mismatch:${fact.op_id}`);
    }
    claims.reviews.push(fact.op_id);
  }
  return claims;
}

export async function assertSyncPackFactClaimsStillHeld(
  port: DbPort, page: SyncPackFactPage, claims: SyncPackFactClaims
) {
  const current = await probeSyncPackFactPresence(port, page);
  for (const kind of ['versions', 'parents', 'reviews'] as const) {
    if (claims[kind].some((id) => !current[kind].includes(id))) {
      throw new Error('sync_pack_fact_presence_changed');
    }
  }
}

export function parentFactKey(fact: SyncParentFact) {
  return JSON.stringify([fact.version_id, fact.parent_version_id, fact.ordinal]);
}

export function selectMissingSyncPackFacts<TVersion extends { version_id: string },
  TParent extends SyncParentFact, TReview extends { op_id: string }>(
  page: { versions: TVersion[]; parents: TParent[]; reviews: TReview[] },
  claims: SyncPackFactClaims
) {
  const versions = new Set(claims.versions);
  const parents = new Set(claims.parents);
  const reviews = new Set(claims.reviews);
  return {
    versions: page.versions.filter((row) => !versions.has(row.version_id)),
    parents: page.parents.filter((row) => !parents.has(parentFactKey(row))),
    reviews: page.reviews.filter((row) => !reviews.has(row.op_id))
  };
}

export function encodeSyncPackFactClaims(page: SyncPackFactPage,
  claims: SyncPackFactClaims): SyncPackFactClaimBits {
  const versions = new Set(claims.versions);
  const parents = new Set(claims.parents);
  const reviews = new Set(claims.reviews);
  return {
    versions: encodeBits(page.versions.map((fact) => versions.has(fact.version_id))),
    parents: encodeBits(page.parents.map((fact) => parents.has(parentFactKey(fact)))),
    reviews: encodeBits(page.reviews.map((fact) => reviews.has(fact.op_id)))
  };
}

export function decodeSyncPackFactClaims(page: SyncPackFactPage,
  bits: SyncPackFactClaimBits): SyncPackFactClaims {
  const versions = decodeBits(bits.versions, page.versions.length);
  const parents = decodeBits(bits.parents, page.parents.length);
  const reviews = decodeBits(bits.reviews, page.reviews.length);
  return {
    versions: page.versions.filter((_, index) => versions[index]).map((fact) => fact.version_id),
    parents: page.parents.filter((_, index) => parents[index]).map(parentFactKey),
    reviews: page.reviews.filter((_, index) => reviews[index]).map((fact) => fact.op_id)
  };
}

function encodeBits(values: boolean[]) {
  const bytes = new Uint8Array(Math.ceil(values.length / 8));
  values.forEach((value, index) => {
    if (value) bytes[Math.floor(index / 8)]! |= 1 << (index % 8);
  });
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function decodeBits(hex: string, count: number) {
  if (hex.length !== Math.ceil(count / 8) * 2 || !/^[0-9a-f]*$/u.test(hex)) {
    throw new Error('sync_pack_fact_claims_invalid');
  }
  const bytes = hex.match(/../gu)?.map((value) => Number.parseInt(value, 16)) ?? [];
  if (count % 8 && (bytes.at(-1)! >> (count % 8)) !== 0) {
    throw new Error('sync_pack_fact_claims_invalid');
  }
  return Array.from({ length: count }, (_, index) =>
    (bytes[Math.floor(index / 8)]! & (1 << (index % 8))) !== 0);
}
