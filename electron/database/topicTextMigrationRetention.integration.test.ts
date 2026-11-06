// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { retainLocalEditBase, releaseLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { loadRetainedSyncNodeVersionFact } from '../../lib/core/sync/syncNodeGraph.js';
import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';

import { restoreEmptyLegacyDailyFlowSchema } from './historicalMigration.test-support.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
function device() { const value = textDevice(); devices.push(value); return value; }
afterEach(() => { devices.splice(0).forEach((value) => value.sqlite.close()); });

async function legacyDevice() {
  const host = device(); await host.receive([textBranch('base', 'Main body')]);
  restoreEmptyLegacyDailyFlowSchema(host.sqlite);
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) host.sqlite.exec(sql);
  const now = new Date().toISOString();
  await host.db.run(`INSERT INTO node_text_alternatives (alternative_id,node_id,source_version_id,body_text,source_host_name,created_at,status,updated_at) VALUES
    ('legacy', 'topic', 'old-branch', 'Legacy alternative', 'Host', ?, 'available', ?)`, [now, now]);
  await host.db.run(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node_text_alternative', 'legacy', 10, 'hash', 'Host', ?, 0)`, [now]);
  return host;
}

it('upgrades legacy alternatives through the historical snapshot into independent ownership', async () => {
  const host = await legacyDevice(); host.sqlite.pragma('user_version = 146');
  initializeDatabaseSchema(host.sqlite);
  const current = await host.current();
  expect(current.ancestor_version_ids).toContain('base');
  expect(await host.wholeBodies()).toEqual(new Set(['Main body', 'Legacy alternative']));
  expect(current.snapshot.text_alternatives ?? []).toEqual([]);
  expect(host.sqlite.prepare("SELECT body_text, status FROM node_text_alternatives WHERE alternative_id='legacy'").get())
    .toEqual({ body_text: '', status: 'superseded' });
  expect(host.sqlite.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_type = 'node_text_alternative'")
    .pluck().get()).toBe(1);
});

it('uses the same one-time migration through the companion transaction port', async () => {
  const host = await legacyDevice();
  await host.db.transaction((tx) => migrateCompanionDatabase(tx, 75, 76));
  expect((await host.current()).alternative_bodies?.map((entry) => entry.text)).toEqual(['Legacy alternative']);
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(76);
});

it('releases obsolete main payloads without depending on dismissed alternatives or changing relations', async () => {
  const host = device(); const base = textBranch('base', 'Base');
  await host.receive([base, textBranch('a', 'Main body that is longer than the disposable alternative', base)]);
  const merged = await host.receive([textBranch('b', 'Disposable alternative', base)]);
  const [entry] = await host.alternatives();
  await retainLocalEditBase(host.db, { holdId: 'draft', nodeId: 'topic', versionId: merged.version_id! });
  await mutateTopicText(host.db, { nodeId: 'topic', alternativeId: entry!.id, action: 'dismissed',
    now: new Date().toISOString(), versionId: 'dismiss', hostName: 'Host' });
  await collectNodeVersionPayloads(host.db, 'topic', 100);
  expect((await host.current()).version_id).toBe(merged.version_id);
  expect(await host.alternatives()).toEqual([]);
  await applyLocalContentEdit(host.db, { nodeId: 'topic', baseVersionId: merged.version_id!,
    baseContent: merged.body_text!, versionId: 'continued', content: 'Continued input', title: 'Topic',
    hideTitleHeading: false, hostName: 'Host', updatedAt: new Date().toISOString() });
  await releaseLocalEditBase(host.db, 'draft', 'topic');
  const released = await loadRetainedSyncNodeVersionFact(host.db, merged.version_id!);
  expect(released?.body_text).toBeNull();
  expect(released?.alternative_bodies).toBeUndefined();
  expect(await host.wholeBodies()).toEqual(new Set(['Continued input']));
  expect(host.sqlite.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ? ORDER BY ordinal')
    .all(merged.version_id)).toEqual([{ parent_version_id: 'a' }, { parent_version_id: 'b' }]);
});
