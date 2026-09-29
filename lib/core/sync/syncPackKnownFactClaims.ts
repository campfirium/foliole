import type { DbPort } from './dbPort.js';
import {
  assertSyncPackFactClaimsStillHeld, parentFactKey, probeSyncPackFactPresence,
  type SyncPackFactClaims, type SyncPackFactIndex, type SyncPackFactPage
} from './syncPackFactPresence.js';

interface FactClaimScope {
  groupId: string;
  peerId: string;
  sourceViewId: string;
}

const SCOPE = 'group_id = ? AND peer_id = ? AND source_view_id = ?';
const scopeParams = (scope: FactClaimScope) => [scope.groupId, scope.peerId, scope.sourceViewId];

export async function stageSyncPackKnownFactClaims(port: DbPort,
  scope: FactClaimScope, index: SyncPackFactIndex): Promise<SyncPackFactClaims> {
  return port.transaction(async (tx) => {
    await storeClaim(tx, scope, 'progress', 'round', {
      from_state_seq: index.from_state_seq, to_state_seq: index.to_state_seq,
      frontier_state_seq: index.frontier_state_seq, source_epoch: index.source_epoch
    });
    const claims = await probeSyncPackFactPresence(tx, index);
    const known = { versions: new Set(claims.versions), parents: new Set(claims.parents),
      reviews: new Set(claims.reviews) };
    for (const fact of index.versions) if (known.versions.has(fact.version_id)) {
      await storeClaim(tx, scope, 'versions', fact.version_id, fact);
    }
    for (const fact of index.parents) if (known.parents.has(parentFactKey(fact))) {
      await storeClaim(tx, scope, 'parents', parentFactKey(fact), fact);
    }
    for (const fact of index.reviews) if (known.reviews.has(fact.op_id)) {
      await storeClaim(tx, scope, 'reviews', fact.op_id, fact);
    }
    return claims;
  });
}

async function storeClaim(port: DbPort, scope: FactClaimScope,
  kind: keyof SyncPackFactPage | 'progress', key: string, fact: object) {
  const json = JSON.stringify(fact);
  const [existing] = await port.query<{ fact_json: string }>(
    `SELECT fact_json FROM sync_pack_known_fact_claims WHERE ${SCOPE} AND kind = ? AND fact_key = ?`,
    [...scopeParams(scope), kind, key]);
  if (existing && existing.fact_json !== json) throw new Error('sync_pack_fact_claim_changed');
  await port.run(`INSERT OR IGNORE INTO sync_pack_known_fact_claims
    (group_id, peer_id, source_view_id, kind, fact_key, fact_json) VALUES (?, ?, ?, ?, ?, ?)`,
  [...scopeParams(scope), kind, key, json]);
}

/** Runs inside the final business transaction, so body collection cannot race the validation. */
export async function assertStagedSyncPackKnownFactsStillHeld(port: DbPort, scope: FactClaimScope) {
  let kind = '';
  let key = '';
  for (;;) {
    const rows = await port.query<{ kind: keyof SyncPackFactPage | 'progress';
      fact_key: string; fact_json: string }>(
      `SELECT kind, fact_key, fact_json FROM sync_pack_known_fact_claims WHERE ${SCOPE}
       AND (kind > ? OR (kind = ? AND fact_key > ?)) ORDER BY kind, fact_key LIMIT 128`,
      [...scopeParams(scope), kind, kind, key]);
    if (!rows.length) break;
    const facts: SyncPackFactPage = { versions: [], parents: [], reviews: [] };
    const claims: SyncPackFactClaims = { versions: [], parents: [], reviews: [] };
    for (const row of rows) {
      if (row.kind === 'progress') continue;
      if (!['versions', 'parents', 'reviews'].includes(row.kind)) throw new Error('sync_pack_fact_claim_invalid');
      const claimKind = row.kind as keyof SyncPackFactPage;
      (facts[claimKind] as object[]).push(JSON.parse(row.fact_json) as object);
      claims[claimKind].push(row.fact_key);
    }
    await assertSyncPackFactClaimsStillHeld(port, facts, claims);
    ({ kind, fact_key: key } = rows.at(-1)!);
  }
}

/** Direct all-known packs use their fact view ID as the pack ID. */
export async function assertDirectSyncPackKnownFactClaims(port: DbPort, args: {
  groupId: string; peerId: string; packId?: string; fromStateSeq: number;
  toStateSeq: number; frontierStateSeq: number; sourceEpoch: string;
}) {
  if (!args.packId) return false;
  const scope = { groupId: args.groupId, peerId: args.peerId, sourceViewId: args.packId };
  const [round] = await port.query<{ fact_json: string }>(
    `SELECT fact_json FROM sync_pack_known_fact_claims WHERE ${SCOPE}
     AND kind = 'progress' AND fact_key = 'round'`, scopeParams(scope));
  if (!round) return false;
  const expected = { from_state_seq: args.fromStateSeq, to_state_seq: args.toStateSeq,
    frontier_state_seq: args.frontierStateSeq, source_epoch: args.sourceEpoch };
  if (round.fact_json !== JSON.stringify(expected)) throw new Error('sync_pack_fact_index_changed');
  await assertStagedSyncPackKnownFactsStillHeld(port, scope);
  return true;
}

export async function loadActiveSyncPackFactRound(port: DbPort, args: {
  groupId: string; peerId: string; fromStateSeq: number;
}) {
  const [row] = await port.query<{ source_view_id: string; fact_json: string }>(
    `SELECT source_view_id, fact_json FROM sync_pack_known_fact_claims
     WHERE group_id = ? AND peer_id = ? AND kind = 'progress' AND fact_key = 'round'
       AND json_extract(fact_json, '$.from_state_seq') = ? ORDER BY rowid DESC LIMIT 1`,
    [args.groupId, args.peerId, args.fromStateSeq]);
  return row ? { sourceViewId: row.source_view_id,
    window: JSON.parse(row.fact_json) as Pick<SyncPackFactIndex,
    'from_state_seq' | 'to_state_seq' | 'frontier_state_seq' | 'source_epoch'> } : null;
}

export async function clearSyncPackKnownFactClaims(port: DbPort, scope: FactClaimScope) {
  await port.run(`DELETE FROM sync_pack_known_fact_claims WHERE ${SCOPE}`, scopeParams(scope));
}
