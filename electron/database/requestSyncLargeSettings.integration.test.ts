// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { materializeDesktopSettingRecord } from './desktopSettingMaterializer.js';
import { closeLibraries, createPeer, joinPeers, startLibraries } from './syncEmptyLibraryTestSupport.js';
import { syncRequestLibrary } from './syncRequestLibrary.testSupport.js';

const keys = ['search_aliases_document', 'readwise_source_mode_conflict', 'review_scheduler_settings',
  'readwise_source_mode', 'readwise_active_host', 'readwise_remote_source'];
const queryBudget = 2 * 1024 * 1024;
beforeEach(startLibraries);
afterEach(closeLibraries);

function boundedResults(db: DbPort, observed: { maximum: number }): DbPort {
  return {
    run: (sql, params) => db.run(sql, params),
    async query<T extends DbRow>(sql: string, params: DbParams = []) {
      const rows = await db.query<T>(sql, params);
      const bytes = rows.reduce((total, row) => total + Object.values(row).reduce<number>((size, value) =>
        size + (typeof value === 'string' ? Buffer.byteLength(value) :
          value instanceof Uint8Array ? value.byteLength : 0), 0), 0);
      observed.maximum = Math.max(observed.maximum, bytes);
      if (bytes > queryBudget) throw new Error('request_query_body_budget_exceeded');
      return rows;
    },
    transaction: execute => db.transaction(tx => execute(boundedResults(tx, observed)))
  };
}

async function seedSettings(db: DbPort) {
  for (const [index, key] of keys.entries()) {
    const payload = buildCanonicalSettingSyncPayload({ form_factor: 'desktop', host_name: '*',
      key, platform: 'windows', scope: 'user_space',
      value_json: JSON.stringify(String(index).repeat(600 * 1024)) });
    await db.transaction(tx => applySyncObjectInTransaction(tx, {
      object_type: 'setting', object_id: `user_space:windows:desktop:*:${key}`,
      content_hash: computeSyncContentHash('setting', payload), deleted_at: null,
      payload_json: JSON.stringify(payload), updated_at: '2026-10-07'
    }, { hostName: 'Provider', onPayloadAppliedInTransaction: materializeDesktopSettingRecord }));
  }
}

it('retries six large settings after a committed object failure with bounded SQLite results', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  await seedSettings(source.port);
  const observed = { maximum: 0 };
  source.port = boundedResults(source.port, observed);
  const targetPort = boundedResults(target.port, observed);
  target.port = { ...targetPort, async transaction(execute) {
    const result = await targetPort.transaction(execute);
    const count = target.db.prepare("SELECT count(*) FROM setting_records WHERE scope = 'user_space'").pluck().get();
    if (count === 2) throw new Error('injected_after_object_commit');
    return result;
  } };
  await expect(syncRequestLibrary(source, target)).rejects.toThrow('injected_after_object_commit');
  expect(target.db.prepare("SELECT count(*) FROM setting_records WHERE scope = 'user_space'").pluck().get()).toBe(2);
  target.port = targetPort;
  await syncRequestLibrary(source, target);
  await syncRequestLibrary(source, target);
  const reopened = new Database(target.file, { readonly: true });
  try {
    const sql = `SELECT key, value_json, content_hash FROM setting_records
      WHERE key IN (${keys.map(() => '?').join(',')}) ORDER BY key`;
    const original = source.db.prepare(sql).all(...keys);
    expect(original).toHaveLength(6);
    expect(reopened.prepare(sql).all(...keys)).toEqual(original);
    expect(observed.maximum).toBeGreaterThan(600 * 1024);
    expect(observed.maximum).toBeLessThanOrEqual(queryBudget);
  } finally { reopened.close(); }
});
