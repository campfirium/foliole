import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { DbPort, DbRow } from '../sync/dbPort.js';
import type { CanonicalFact } from '../sync/framedSyncCanonicalManifest.js';
import { restoreFramedSyncParentRelation, restoreFramedSyncReview } from '../sync/framedSyncRelationReviewFact.js';

import { framedSyncNodeInventorySql } from './framedSyncInventoryProjectionSql.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS } from './framedSyncInventorySchema.js';
import { decodeFramedSyncManifest } from './framedSyncStagingSerialization.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { isRetiredSyncSchema, RETIRED_SYNC_TABLES } from './retiredSyncSchema.js';
import { hashTextBodyWithLength } from './textBodyHash.js';

const schemaSql = "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table', 'trigger')";
const publicationsSql = `SELECT manifest_json FROM framed_sync_outbound_publications
  WHERE state = 'published' OR transfer_id IN (SELECT transfer_id FROM framed_sync_outbound_holds)`;
const identitySql = `SELECT object_id, content_hash, parent_version_id, body_text, snapshot_json FROM node_sync_versions WHERE version_id = ?
  UNION ALL SELECT node_id AS object_id, content_hash, parent_version_id, json_extract(snapshot_json, '$.content') AS body_text, snapshot_json FROM node_sync_tombstones WHERE version_id = ?`;
const relationSql = `SELECT p.version_id, p.parent_version_id, p.ordinal, v.object_id
  FROM node_sync_version_parents p JOIN (
    SELECT version_id, object_id FROM node_sync_versions
    UNION ALL SELECT version_id, node_id AS object_id FROM node_sync_tombstones
  ) v ON v.version_id = p.version_id
  WHERE p.version_id = ?`;
const parentsSql = 'SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ? ORDER BY ordinal';
const schemaRows = z.array(z.object({ name: z.string(), type: z.string(), sql: z.string().nullable() }));
const rows = z.array(z.record(z.string(), z.unknown()));

function originalFacts(publications: DbRow[]) {
  return publications.flatMap(row => decodeFramedSyncManifest(z.string().parse(row.manifest_json)).facts)
    .filter(fact => (fact.kind === 2 || fact.kind === 3 || fact.kind === 4) && fact.objectType === 'node');
}

function assertOriginalRelation(fact: CanonicalFact, facts: DbRow[]) {
  const original = fact.kind === 4 ? restoreFramedSyncReview(fact) : restoreFramedSyncParentRelation(fact);
  if (!facts.some(row => Object.entries(original).every(([key, value]) => row[key] === value))) {
    throw new Error(`legacy_sync_original_${fact.kind === 4 ? 'review' : 'relation'}_unbacked:${fact.globalId}:${fact.factId}`);
  }
}

function assertOriginal(fact: CanonicalFact, identities: DbRow[], parents: DbRow[]) {
  const id = identities.find(row => row.object_id === fact.globalId && row.content_hash === bytesToHex(fact.sharedStateHash));
  if (!id) throw new Error(`legacy_sync_original_fact_unbacked:${fact.globalId}:${fact.factId}`);
  assertOriginalBodies(fact, identities.filter(row => row.object_id === id.object_id && row.content_hash === id.content_hash));
  const field = fact.body.find(value => value.name === 'parent_version_ids')?.value;
  if (field?.kind !== 'list' || field.value.some(value => value.kind !== 'string')) {
    throw new Error('legacy_sync_original_parents_invalid');
  }
  const expected = field.value.map(value => value.kind === 'string' ? value.value : '').sort();
  const actual = (parents.length ? parents.map(row => z.string().parse(row.parent_version_id))
    : id.parent_version_id ? [z.string().parse(id.parent_version_id)] : []).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`legacy_sync_original_parents_unbacked:${fact.globalId}:${fact.factId}`);
  }
}

function assertOriginalBodies(fact: CanonicalFact, identities: DbRow[]) {
  const snapshot = z.object({ text_alternative_bodies: z.array(z.object({ text: z.string() })).optional() });
  const bodies = identities.flatMap(row => [
    ...(typeof row.body_text === 'string' ? [row.body_text] : []),
    ...snapshot.parse(JSON.parse(z.string().parse(row.snapshot_json))).text_alternative_bodies?.map(body => body.text) ?? []
  ]).map(hashTextBodyWithLength);
  for (const blob of fact.blobs.filter(value => value.role === 1)) {
    if (!bodies.some(body => body.hash === bytesToHex(blob.sha256) && BigInt(body.byteLength) === blob.byteLength)) {
      throw new Error(`legacy_sync_original_body_unbacked:${fact.globalId}:${fact.factId}`);
    }
  }
}

function retirementStatements(schema: z.infer<typeof schemaRows>) {
  const tables = new Set(schema.filter(row => row.type === 'table').map(row => row.name));
  const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;
  return [
    ...schema.filter(row => row.type === 'trigger' && row.sql && isRetiredSyncSchema(row.sql))
      .map(row => `DROP TRIGGER ${quoted(row.name)}`),
    ...[...RETIRED_SYNC_TABLES].reverse().filter(name => tables.has(name))
      .map(name => `DROP TABLE ${quoted(name)}`)
  ];
}

/** The schema owner commits or rolls back the entire retirement. Business facts and positions stay intact. */
export function retireLegacySyncState(sqlite: DatabaseMigrationTarget) {
  const schema = schemaRows.parse(sqlite.prepare(schemaSql).all());
  if (schema.some(row => row.name === 'framed_sync_outbound_publications')) {
    for (const fact of originalFacts(rows.parse(sqlite.prepare(publicationsSql).all()))) {
      if (fact.kind === 3 || fact.kind === 4) {
        const sql = fact.kind === 4 ? 'SELECT * FROM review_log WHERE op_id = ?' : relationSql;
        const key = fact.kind === 4 ? fact.factId : restoreFramedSyncParentRelation(fact).version_id;
        assertOriginalRelation(fact, rows.parse(sqlite.prepare(sql).all(key)));
        continue;
      }
      assertOriginal(fact, rows.parse(sqlite.prepare(identitySql).all(fact.factId, fact.factId)),
        rows.parse(sqlite.prepare(parentsSql).all(fact.factId)));
    }
  }
  sqlite.exec('PRAGMA defer_foreign_keys = ON');
  for (const sql of retirementStatements(schema)) sqlite.exec(sql);
  refreshReadingInventory(sqlite);
}

function refreshReadingInventory(sqlite: DatabaseMigrationTarget) {
  for (const sql of FRAMED_SYNC_INVENTORY_TRIGGERS) {
    const name = /^CREATE TRIGGER IF NOT EXISTS (\w+)/u.exec(sql)?.[1];
    if (!name) throw new Error('framed_sync_inventory_trigger_name_invalid');
    sqlite.exec(`DROP TRIGGER IF EXISTS ${name}`);
    sqlite.exec(sql);
  }
  sqlite.exec(framedSyncNodeInventorySql(`SELECT object_id FROM sync_object_state
    WHERE object_type = 'node_reading'`));
}

export async function retireCompanionLegacySyncState(db: DbPort) {
  const schema = schemaRows.parse(await db.query(schemaSql));
  await db.run('PRAGMA defer_foreign_keys = ON');
  for (const sql of retirementStatements(schema)) await db.run(sql);
}
