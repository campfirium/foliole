// @vitest-environment node
import { readFileSync } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { SYNC_SCHEMA_STATEMENTS } from '../database/syncSchemaStatements.js';
import { computeSyncContentHash } from '../database/syncState.js';

import { stageSyncIdentityParentOrderRecordMerge } from './syncIdentityParentOrderApply.js';
import { planParentOrderResolution } from './syncParentOrderResolutionPlan.js';
import { resolveParentOrderHeads, resolvePlannedParentOrderHeads } from './syncParentOrderResolve.js';
import { insertParentOrderVersion, PARENT_ORDER_VERSION_SCHEMA } from './syncParentOrderVersionStore.js';

const fixtureSchema = z.object({
  revision: z.literal('96490e954bea5d6e610794c8b9504807f581ecda'),
  name: z.string(),
  versions: z.array(z.object({ versionId: z.string(),
    kind: z.enum(['baseline', 'membership', 'merge', 'user']),
    order: z.array(z.string()), parentVersionIds: z.array(z.string()) })),
  headIds: z.array(z.string()), members: z.array(z.string()),
  expected: z.object({ order: z.array(z.string()), mergeId: z.string(),
    winningVersionId: z.string(), losingVersionIds: z.array(z.string()),
    version: z.object({ versionId: z.string(), kind: z.literal('merge'),
      order: z.array(z.string()), parentVersionIds: z.array(z.string()) }) })
});

function loadFixture(name: string) {
  return fixtureSchema.parse(JSON.parse(readFileSync(
    new URL(`./fixtures/parent-order-${name}.json`, import.meta.url), 'utf8')));
}

// Fixed outputs were generated with the resolver at the recorded pre-change revision.
for (const name of ['concurrent-users', 'reversed-heads',
  'superseded-users-with-membership-side', 'duplicate-original-delivery']) {
  it(`preserves the original complete merge result for ${name}`, () => {
    const f = loadFixture(name);
    const args = { versions: f.versions, headIds: f.headIds,
      members: new Set(f.members), compareAdded: (a: string, b: string) => a.localeCompare(b) };
    expect(resolveParentOrderHeads(args)).toEqual(f.expected);
    const lineage = f.versions.map(({ versionId, kind, parentVersionIds }) =>
      ({ versionId, kind, parentVersionIds }));
    const plan = planParentOrderResolution(lineage, f.headIds);
    const versions = new Map(f.versions.filter((version) => plan.requiredVersionIds.has(version.versionId))
      .map((version) => [version.versionId, version]));
    expect(resolvePlannedParentOrderHeads({ ...args, versions, plan })).toEqual(f.expected);
  });
}

it('stages the original generated merge from persisted superseded edits and membership facts', async () => {
  const f = loadFixture('superseded-users-with-membership-side');
  const sqlite = new Database(':memory:');
  try {
    for (const sql of [...SYNC_SCHEMA_STATEMENTS, ...PARENT_ORDER_VERSION_SCHEMA]) sqlite.exec(sql);
    sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT, parent_id TEXT, deleted_at TEXT);
      CREATE TABLE parent_child_order (parent_id TEXT PRIMARY KEY, child_ids_json TEXT, updated_at TEXT)`);
    for (const id of f.members) sqlite.prepare("INSERT INTO nodes VALUES (?, ?, 'folder', NULL)").run(id, id);
    const db = createBetterSqliteDbPort(sqlite);
    for (const version of f.versions) await insertParentOrderVersion(db, 'folder', version, '2026-10-07');
    const left = f.versions.find((version) => version.versionId === f.headIds[0])!;
    const right = f.versions.find((version) => version.versionId === f.headIds[1])!;
    const payload = (order: readonly string[]) => ({ parent_id: 'folder', child_ids_json: JSON.stringify(order) });
    sqlite.prepare('INSERT INTO parent_child_order VALUES (?, ?, ?)').run('folder', JSON.stringify(left.order), 'now');
    sqlite.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq, content_hash,
      updated_at, current_version_id, sync_dirty, last_modified_by_host_name)
      VALUES ('parent_child_order', 'folder',
        (SELECT high_water + 1 FROM sync_state_sequence WHERE singleton_id = 1), ?, 'now', ?, 0, 'local')`)
      .run(computeSyncContentHash('parent_child_order', payload(left.order)), left.versionId);
    const before = sqlite.prepare('SELECT * FROM parent_order_versions ORDER BY version_id').all();
    const result = await stageSyncIdentityParentOrderRecordMerge(db, { parent_id: 'folder', deleted_at: null,
      payload_json: JSON.stringify(payload(right.order)), current_version_id: right.versionId,
      content_hash: computeSyncContentHash('parent_child_order', payload(right.order)) });
    expect(result).toMatchObject({ childIdsJson: JSON.stringify(f.expected.order), version: f.expected.version });
    expect(sqlite.prepare('SELECT * FROM parent_order_versions ORDER BY version_id').all()).toEqual(before);
  } finally { sqlite.close(); }
});
