// @vitest-environment node
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { canonicalContentId, canonicalManifestBytes, canonicalTransferId,
  type CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createDesktopFramedSyncStaging } from './desktopFramedSyncStaging.js';

const digest = (text: string) => new Uint8Array(createHash('sha256').update(text).digest());

function factBytes(fact: CanonicalFact) {
  const manifest = canonicalManifestBytes({ facts: [fact], blobs: fact.blobs });
  const prefix = 4 + new TextEncoder().encode('foliole-framed-sync-content-v1').length + 4;
  return manifest.slice(prefix, manifest.length - 4 - fact.blobs.length * (4 + 32 + 8 + 4 + 1));
}

async function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
  const db = createBetterSqliteDbPort(sqlite);
  const blobs = [1, 2].map((index) => ({ sha256: digest(`blob-${index}`), byteLength: BigInt(index), role: 1, required: true }));
  const facts: CanonicalFact[] = ['🙂', '\ue000', '中文'].flatMap((id, index) => [1, 2].map((kind) => ({
    blobs, kind, objectType: 'node', globalId: id, factId: `版-${index}-${kind}`,
    sharedStateHash: digest(`${id}-${kind}`), body: [{ name: 'text', value: { kind: 'string', value: '正文🙂\u0000'.repeat(1000) } }]
  })));
  const contentId = await canonicalContentId({ facts, blobs });
  const context = { protocolVersion: 22 as const, groupId: 'group', senderDeviceId: 'sender', senderLibraryEpoch: 's',
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'r' };
  const transferId = await canonicalTransferId(context, contentId);
  const attemptId = new Uint8Array(16).fill(9);
  const proposal = { transferId, contentId, context, factCount: BigInt(facts.length), blobCount: 2n, totalBlobBytes: 3n };
  const staging = createDesktopFramedSyncStaging(db);
  const { reservationId } = await staging.admitInboundProposal(proposal);
  await staging.commitInboundHeaderDeclaration({ attemptId, blobs,
    facts: facts.map((fact) => ({ kind: fact.kind, objectType: fact.objectType, globalId: fact.globalId,
      factId: fact.factId, sharedStateHash: fact.sharedStateHash, requiredBlobHashes: blobs.map((blob) => blob.sha256) })),
    proposal, published: { ...proposal, manifestHash: contentId }, reservationId });
  for (const fact of [...facts].reverse()) {
    await staging.stageInboundFact({ attemptId, transferId, canonicalBytes: factBytes(fact), factId: fact.factId,
      factKind: fact.kind, globalId: fact.globalId, objectType: fact.objectType });
  }
  await staging.commitBlobOfferAndMissingSet({ transferId, blobs: [...blobs].reverse() });
  return { sqlite, db, staging, attemptId, transferId, contentId, facts, blobs,
    finalize: { attemptId, transferId, manifestHash: contentId, factCount: BigInt(facts.length), blobCount: 2n } };
}

function observed(db: DbPort) {
  const reads: { sql: string; rows: readonly DbRow[] }[] = [];
  const wrap = (port: DbPort): DbPort => ({ ...port,
    async query<T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) {
      const rows = await port.query<T>(sql, params);
      if (sql.includes('framed_sync_inbound_facts') || sql.includes('framed_sync_blob_offers')) reads.push({ sql, rows });
      return rows;
    }, transaction: (run) => port.transaction((tx) => run(wrap(tx))) });
  return { port: wrap(db), reads };
}

it('matches canonical UTF8 ordering for reversed unique facts while reading only one payload per query', async () => {
  const host = await fixture();
  try {
    const boundary = observed(host.db);
    const staging = createDesktopFramedSyncStaging(boundary.port);
    expect(await staging.finalizeInboundAttempt(host.finalize)).toBe('created');
    const row = host.sqlite.prepare<[], { canonical_manifest: Buffer }>(
      'SELECT canonical_manifest FROM framed_sync_inbound_transfers').get()!;
    expect(new Uint8Array(row.canonical_manifest)).toEqual(host.contentId);
    const payloadReads = boundary.reads.filter(({ sql }) => sql.includes('SELECT canonical_bytes'));
    expect(payloadReads).toHaveLength(host.facts.length);
    expect(payloadReads.every(({ rows }) => rows.length === 1)).toBe(true);
    const skinny = boundary.reads.find(({ sql }) => sql.includes('SELECT fact_kind'))!;
    expect(skinny.rows).toHaveLength(host.facts.length);
    expect(skinny.rows.every((row) => !('canonical_bytes' in row))).toBe(true);
    expect(boundary.reads.find(({ sql }) => sql.includes('framed_sync_blob_offers'))?.rows).toEqual([{ count: 2 }]);
    expect(await staging.finalizeInboundAttempt(host.finalize)).toBe('identical');
  } finally { host.sqlite.close(); }
});

it('keeps identical repeated facts counted once and preserves their manifest hash', async () => {
  const host = await fixture();
  try {
    const fact = host.facts[0]!;
    expect(await host.staging.stageInboundFact({ attemptId: host.attemptId, transferId: host.transferId,
      canonicalBytes: factBytes(fact), factKind: fact.kind, factId: fact.factId,
      objectType: fact.objectType, globalId: fact.globalId })).toBe('identical');
    expect(await host.staging.finalizeInboundAttempt(host.finalize)).toBe('created');
    expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_inbound_facts').pluck().get()).toBe(host.facts.length);
  } finally { host.sqlite.close(); }
});

it('commits invalid attempt cleanup before reporting the original manifest error', async () => {
  const host = await fixture();
  try {
    await host.staging.commitAuthenticatedFrame({ attemptId: host.attemptId, transferId: host.transferId,
      sequence: 0n, frameType: 3, authenticatedPlaintext: Uint8Array.of(1), ciphertext: Uint8Array.of(2),
      frameHeader: new Uint8Array(16), preamble: new Uint8Array(96) });
    await host.staging.writeBlobChunk({ attemptId: host.attemptId, transferId: host.transferId,
      sha256: host.blobs[0]!.sha256, offset: 0n, data: Uint8Array.of(1) });
    await expect(host.staging.finalizeInboundAttempt({ ...host.finalize, manifestHash: digest('wrong') }))
      .rejects.toThrow('inbound_attempt_manifest_mismatch');
    for (const table of ['framed_sync_inbound_facts', 'framed_sync_blob_offers', 'framed_sync_blob_chunks',
      'framed_sync_inbound_frames', 'framed_sync_blob_pins']) {
      expect(host.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    expect(host.sqlite.prepare('SELECT state FROM framed_sync_inbound_attempts').get()).toEqual({ state: 'invalidated' });
    expect(host.sqlite.prepare(`SELECT state, active_attempt_id, header_json, canonical_manifest
      FROM framed_sync_inbound_transfers`).get()).toEqual({ state: 'proposed', active_attempt_id: null,
      header_json: null, canonical_manifest: null });
  } finally { host.sqlite.close(); }
});
