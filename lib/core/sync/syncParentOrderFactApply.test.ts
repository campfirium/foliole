import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { SYNC_SCHEMA_STATEMENTS } from '../database/syncSchemaStatements.js';

import { hashText } from './syncNodeResolution.js';
import { parentOrderFactPayload } from './syncParentOrderFact.js';
import { applyParentOrderFactObject } from './syncParentOrderFactApply.js';
import { resolveParentOrderHeads } from './syncParentOrderResolve.js';
import type { ParentOrderVersion } from './syncParentOrderVersionGraph.js';
import { PARENT_ORDER_VERSION_SCHEMA, readParentOrderVersion } from './syncParentOrderVersionStore.js';

it('receives immutable snapshots before their ancestors and relays their original identities', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const statement of [...SYNC_SCHEMA_STATEMENTS, ...PARENT_ORDER_VERSION_SCHEMA]) {
      sqlite.exec(statement);
    }
    const port = createBetterSqliteDbPort(sqlite);
    const base: ParentOrderVersion = { versionId: 'base', kind: 'baseline',
      order: ['a', 'b'], parentVersionIds: [] };
    const user: ParentOrderVersion = { versionId: 'original-user', kind: 'user',
      order: ['b', 'a'], parentVersionIds: ['base'] };
    const record = (version: ParentOrderVersion) => {
      const payload = parentOrderFactPayload('folder', version, 'original-time');
      return { object_type: 'order_version', object_id: version.versionId,
        content_hash: hashText(JSON.stringify(payload)), payload_json: JSON.stringify(payload),
        deleted_at: null, updated_at: 'original-time' };
    };
    await applyParentOrderFactObject(port, record(user));
    expect(await readParentOrderVersion(port, user.versionId)).toMatchObject(user);
    expect(sqlite.prepare('SELECT COUNT(*) FROM parent_order_heads').pluck().get()).toBe(0);
    expect(() => resolveParentOrderHeads({ versions: [user], headIds: [user.versionId],
      members: new Set(['a', 'b']), compareAdded: (a, b) => a.localeCompare(b) }))
      .toThrow('sync_parent_order_lineage_unproven');
    await applyParentOrderFactObject(port, record(base));
    await applyParentOrderFactObject(port, record(user));
    const state = sqlite.prepare(`SELECT object_id, content_hash FROM sync_object_state
      WHERE object_type = 'order_version' AND object_id = ?`).get(user.versionId);
    expect(state).toEqual({ object_id: user.versionId, content_hash: record(user).content_hash });
    expect(resolveParentOrderHeads({ versions: [base, user], headIds: [user.versionId],
      members: new Set(['a', 'b']), compareAdded: (a, b) => a.localeCompare(b) }).version)
      .toEqual(user);
    await expect(applyParentOrderFactObject(port, { ...record(user), content_hash: 'tampered' }))
      .rejects.toThrow('sync_parent_order_fact_hash_mismatch');
    await expect(applyParentOrderFactObject(port, record({ ...user, order: ['a', 'b'] })))
      .rejects.toThrow('sync_parent_order_fact_collision');
  } finally { sqlite.close(); }
});
