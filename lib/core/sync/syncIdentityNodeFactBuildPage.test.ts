import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import { port, setupVersionCollectionFixture, sqlite, proveBase } from '../../../electron/database/nodeVersionPayloadCollector.testSupport.js';

import { identityParentRowSchema, identityReviewRowSchema, identityVersionRowSchema } from './syncIdentityFactRowSchemas.js';
import { IDENTITY_REVIEW_COLUMNS } from './syncIdentityFactSourceRows.js';
import { buildSyncIdentityNodeFactPage } from './syncIdentityNodeFactBuildPage.js';
import { addSyncIdentityNodeFactDigest } from './syncIdentityNodeFactDigest.js';
import { buildSyncIdentityNodeFactIndex, SYNC_IDENTITY_FACT_PROOF_REVISION } from './syncIdentityNodeFactIndex.js';
import { readSyncIdentityRetentionRequirements } from './syncIdentityRequiredFactProjection.js';
import { syncIdentityRetentionIsComplete } from './syncIdentityRetentionCompleteness.js';
import { describeVersionFact } from './syncPackFactPresence.js';

setupVersionCollectionFixture();

function insertReviews() {
  const insert = sqlite.prepare(`INSERT INTO review_log (${IDENTITY_REVIEW_COLUMNS.join(', ')})
    VALUES (?, ?, 'local', 'node', 3, 'v1', 'now', 'earlier', 1, 1, 'later', 1, 1)`);
  for (let index = 0; index < 200; index += 1) {
    const id = `review-${index.toString().padStart(3, '0')}`;
    insert.run(id, id);
  }
}

async function scalarFact(nodeId: string) {
  const hash = sha256.create();
  for (const row of sqlite.prepare('SELECT * FROM node_sync_versions WHERE object_id = ? ORDER BY version_id').all(nodeId)) {
    addSyncIdentityNodeFactDigest(hash, 'version', describeVersionFact(identityVersionRowSchema.parse(row)));
  }
  for (const row of sqlite.prepare(`SELECT parent.version_id, parent.parent_version_id, parent.ordinal
    FROM node_sync_version_parents parent JOIN node_sync_versions version ON version.version_id = parent.version_id
    WHERE version.object_id = ? ORDER BY parent.version_id, parent.ordinal, parent.parent_version_id`).all(nodeId)) {
    addSyncIdentityNodeFactDigest(hash, 'parent', identityParentRowSchema.parse(row));
  }
  for (const row of sqlite.prepare(`SELECT ${IDENTITY_REVIEW_COLUMNS.join(', ')}
    FROM review_log WHERE node_id = ? ORDER BY op_id`).all(nodeId)) {
    addSyncIdentityNodeFactDigest(hash, 'review', identityReviewRowSchema.parse(row));
  }
  const requirements = await readSyncIdentityRetentionRequirements(port, nodeId);
  const repairRequired = !await syncIdentityRetentionIsComplete(port, 'main', nodeId, requirements);
  return { digest: bytesToHex(hash.digest()), repair_required: repairRequired ? 1 : 0,
    requirements_digest: bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([
      SYNC_IDENTITY_FACT_PROOF_REVISION, requirements.headId, requirements.protectedIds,
      requirements.frozenIds, repairRequired])))) };
}

it('preserves scalar facts and missing-original verdicts across node and fact page boundaries', async () => {
  proveBase('B');
  insertReviews();
  sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL, snapshot_json = '{"content":null}' WHERE version_id = 'B';
    INSERT INTO node_sync_tombstones VALUES ('tomb', 'original-missing', NULL, 'remote', 'hash', '{}', 'now', 'now')`);
  const ids = ['node', 'tomb'];
  for (let index = 0; index < 127; index += 1) {
    const id = `other-${index}`;
    ids.push(id);
    sqlite.prepare(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
      VALUES (?, 'topic', 'Other', 'now', 'now')`).run(id);
  }
  for (let index = 0; index < 260; index += 1) {
    const id = `fork-${index.toString().padStart(3, '0')}`;
    const parent = index ? `fork-${(index - 1).toString().padStart(3, '0')}` : 'E';
    sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'node', ?, 'local', 'now', 'hash', 'fork-body', '{"content":"fork-body"}')`).run(id, parent);
    sqlite.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)').run(id, parent);
  }
  sqlite.exec("INSERT INTO node_sync_version_parents VALUES ('fork-259', 'B', 1)");
  for (const id of ids) sqlite.prepare(`INSERT INTO sync_identity_index_rows
    (object_type, object_id, partition, fingerprint, updated_at) VALUES ('node', ?, 0, ?, 'now')`).run(id, `state-${id}`);
  const expected = new Map<string, Awaited<ReturnType<typeof scalarFact>>>();
  for (const id of ids) expected.set(id, await scalarFact(id));
  let queries = 0;
  const measured = { ...port, query: async <T extends Record<string, unknown>>(sql: string,
    params?: Parameters<typeof port.query>[1]) => { queries += 1; return port.query<T>(sql, params); } };
  await buildSyncIdentityNodeFactIndex(measured);
  const actual = await port.query<{ node_id: string }>('SELECT * FROM sync_identity_node_facts');
  expect(actual).toHaveLength(ids.length);
  for (const row of actual) expect(row).toMatchObject({ ...expected.get(row.node_id), state_fingerprint: `state-${row.node_id}` });
  expect(queries).toBeLessThan(30);
  expect(expected.get('tomb')?.repair_required).toBe(1);
  await expect(buildSyncIdentityNodeFactPage(port, 'main',
    ids.map((id) => ({ id, state_fingerprint: '' })), SYNC_IDENTITY_FACT_PROOF_REVISION))
    .rejects.toThrow('sync_identity_fact_build_page_invalid');
});

it('builds the same immutable facts from an attached snapshot after the live body changes', async () => {
  sqlite.exec(`INSERT INTO sync_identity_index_rows
    (object_type, object_id, partition, fingerprint, updated_at) VALUES ('node', 'node', 0, 'state', 'now')`);
  await buildSyncIdentityNodeFactIndex(port);
  const expected = await port.query('SELECT * FROM sync_identity_node_facts');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-fact-page-'));
  try {
    const snapshot = path.join(root, 'snapshot.db');
    await sqlite.backup(snapshot);
    await port.run('ATTACH DATABASE ? AS identity_view', [snapshot]);
    try {
      sqlite.exec("UPDATE node_sync_versions SET body_text = 'changed' WHERE version_id = 'E'");
      await buildSyncIdentityNodeFactIndex(port, 'identity_view');
      expect(await port.query('SELECT * FROM identity_view.sync_identity_node_facts')).toEqual(expected);
    } finally {
      await port.run('DETACH DATABASE identity_view');
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
