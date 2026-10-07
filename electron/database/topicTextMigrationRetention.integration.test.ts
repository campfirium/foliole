// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { retainLocalEditBase, releaseLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
function device() { const value = textDevice(); devices.push(value); return value; }
afterEach(() => { devices.splice(0).forEach((value) => value.sqlite.close()); });

async function legacyDevice() {
  const host = device(); await host.receive([textBranch('base', 'Main body')]);
  const now = new Date().toISOString();
  await host.db.run(`INSERT INTO node_text_alternatives VALUES
    ('legacy', 'topic', 'old-branch', 'Legacy alternative', 'Host', ?, 'available', ?)`, [now, now]);
  await host.db.run(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node_text_alternative', 'legacy', 10, 'hash', 'Host', ?, 0)`, [now]);
  return host;
}

it('migrates existing desktop alternatives into one successor and retires the independent payload', async () => {
  const host = await legacyDevice(); host.sqlite.pragma('user_version = 146');
  initializeDatabaseSchema(host.sqlite);
  const current = await host.current();
  expect(current.parent_version_ids).toEqual(['base']);
  expect(current.alternative_bodies?.map((entry) => entry.text)).toEqual(['Legacy alternative']);
  expect(host.sqlite.prepare('SELECT body_text, status FROM node_text_alternatives').get())
    .toEqual({ body_text: '', status: 'superseded' });
  expect(host.sqlite.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_type = 'node_text_alternative'")
    .pluck().get()).toBe(0);
});

it('uses the same one-time migration through the companion transaction port', async () => {
  const host = await legacyDevice();
  await host.db.transaction((tx) => migrateCompanionDatabase(tx, 75, 76));
  expect((await host.current()).alternative_bodies?.map((entry) => entry.text)).toEqual(['Legacy alternative']);
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(76);
});

it('releases dismissed body bytes after whole-version edit holds end while retaining original relations', async () => {
  const host = device(); const base = textBranch('base', 'Base');
  await host.receive([base, textBranch('a', 'Main body that is longer than the disposable alternative', base)]);
  const merged = await host.receive([textBranch('b', 'Disposable alternative', base)]);
  const entry = merged.snapshot.text_alternatives![0]!;
  await retainLocalEditBase(host.db, { holdId: 'draft', nodeId: 'topic', versionId: merged.version_id! });
  await mutateTopicText(host.db, { nodeId: 'topic', alternativeId: entry.id, action: 'dismissed',
    now: new Date().toISOString(), versionId: 'dismiss', hostName: 'Host' });
  await collectNodeVersionPayloads(host.db, 'topic', 100);
  expect(host.sqlite.prepare('SELECT 1 FROM content_blob_data WHERE hash = ?').get(entry.body_blob_hash)).toBeDefined();
  await releaseLocalEditBase(host.db, 'draft', 'topic');
  await collectNodeVersionPayloads(host.db, 'topic', 100);
  expect(host.sqlite.prepare('SELECT 1 FROM content_blob_data WHERE hash = ?').get(entry.body_blob_hash)).toBeUndefined();
  expect(host.sqlite.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ? ORDER BY ordinal')
    .all(merged.version_id)).toEqual([{ parent_version_id: 'a' }, { parent_version_id: 'b' }]);
});
