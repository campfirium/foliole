// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { applyEditorSyncNodeRecord } from '../../lib/core/sync/localContentEditBranch.js';
import { localContentEditResources } from '../../lib/core/sync/localContentEditResources.js';
import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
function device() { const value = textDevice(); devices.push(value); return value; }
afterEach(() => { devices.splice(0).forEach(value => value.sqlite.close()); });
const image = { storage_key: `${'a'.repeat(64)}.png`, original_name: 'Original.png', role: 'image' as const };
const body = `![image](asset://${image.storage_key})`;
const now = '2026-10-17T10:00:00.000Z';

it('keeps retry identity local while syncing unchanged version facts', async () => {
  const a = device(); const b = device();
  const base = textBranch('base', 'Original');
  await a.receive([base]); await b.receive([base]);
  await retainLocalEditBase(a.db, { holdId: 'editor', nodeId: 'topic', versionId: 'base' });
  const input = { nodeId: 'topic', baseVersionId: 'base', versionId: 'edit', content: body,
    title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now, newImageReferences: [image] };
  await applyLocalContentEdit(a.db, input);
  const saved = await a.current();
  expect(saved.snapshot).not.toHaveProperty('local_edit_image_input_hash');
  const fact = a.sqlite.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get('edit');
  await b.receive([saved]);
  expect((await b.current()).snapshot).not.toHaveProperty('local_edit_image_input_hash');
  await applyLocalContentEdit(a.db, input);
  expect(a.sqlite.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?').get('edit')).toEqual(fact);
  await expect(applyLocalContentEdit(a.db, { ...input, newImageReferences: [] }))
    .rejects.toThrow('content_edit_version_mismatch');
  await expect(applyLocalContentEdit(b.db, input)).rejects.toThrow('content_edit_version_mismatch');
});

it.each(['inline', 'blob'] as const)('protects the concurrent %s body image when a stale editor removes it', async format => {
  const { hashTextBody } = await import('../../lib/core/database/textBodyHash.js');
  const a = device(); const b = device();
  const base = textBranch('base', body); base.snapshot.resource_references = JSON.stringify([image]);
  const current = textBranch('remote', `${body}\nRemote edit`, base, now);
  current.snapshot.resource_references = JSON.stringify([image]);
  if (format === 'blob') {
    base.snapshot.body_blob_hash = hashTextBody(body);
    current.snapshot.body_blob_hash = hashTextBody(current.body_text!);
  } else {
    base.snapshot.body_blob_hash = null; current.snapshot.body_blob_hash = null;
  }
  expect(JSON.parse(localContentEditResources(base, current, 'Removed locally', []))).toEqual([image]);
  await a.receive([base]); await b.receive([base]);
  await retainLocalEditBase(a.db, { holdId: 'editor', nodeId: 'topic', versionId: 'base' });
  await a.receive([current]); await b.receive([current]);
  await applyLocalContentEdit(a.db, { nodeId: 'topic', baseContent: body, baseVersionId: 'base', versionId: 'remove',
    content: 'Removed locally', title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now });
  const branch = a.sqlite.prepare('SELECT snapshot_json FROM node_sync_versions WHERE version_id = ?').pluck().get('remove');
  expect(JSON.parse(JSON.parse(String(branch)).resource_references)).toContainEqual(image);
  const remote = await b.receive([await a.current()]);
  expect(JSON.parse(remote.snapshot.resource_references!)).toContainEqual(image);
});

it('rolls back the entire save when its local retry receipt cannot be committed', async () => {
  const a = device(); await a.receive([textBranch('base', 'Original')]);
  a.sqlite.exec(`CREATE TRIGGER fail_retry_receipt BEFORE INSERT ON node_version_local_origins
    WHEN NEW.content_edit_image_input_hash IS NOT NULL BEGIN SELECT RAISE(ABORT, 'receipt_failure'); END`);
  const input = { nodeId: 'topic', baseVersionId: 'base', versionId: 'retry', content: body,
    title: 'Topic', hideTitleHeading: false, hostName: 'a', updatedAt: now, newImageReferences: [image] };
  await expect(applyLocalContentEdit(a.db, input)).rejects.toThrow('receipt_failure');
  expect((await a.current()).version_id).toBe('base');
  expect(a.sqlite.prepare("SELECT * FROM node_sync_versions WHERE version_id = 'retry'").get()).toBeUndefined();
  expect(a.sqlite.prepare("SELECT * FROM node_version_local_origins WHERE version_id = 'retry'").get()).toBeUndefined();
  a.sqlite.exec('DROP TRIGGER fail_retry_receipt');
  await applyLocalContentEdit(a.db, input);
  expect((await applyLocalContentEdit(a.db, input)).current.version_id).toBe('retry');
});

it.each(['desktop', 'companion'] as const)('adds local retry storage without changing existing %s version facts', async platform => {
  const host = device(); await host.receive([textBranch('base', 'Original')]);
  const facts = host.sqlite.prepare('SELECT * FROM node_sync_versions').all();
  host.sqlite.exec(`DROP TABLE node_version_local_origins;
    CREATE TABLE node_version_local_origins (version_id TEXT PRIMARY KEY REFERENCES node_sync_versions(version_id) ON DELETE CASCADE);
    INSERT INTO node_version_local_origins VALUES ('base');`);
  host.sqlite.pragma(`user_version = ${platform === 'desktop' ? 162 : 91}`);
  if (platform === 'desktop') initializeDatabaseSchema(host.sqlite);
  else await migrateCompanionDatabase(host.db, 91, COMPANION_DATABASE_VERSION);
  expect(host.sqlite.prepare('PRAGMA table_info(node_version_local_origins)').all())
    .toContainEqual(expect.objectContaining({ name: 'content_edit_image_input_hash' }));
  expect(host.sqlite.prepare('SELECT * FROM node_version_local_origins').all())
    .toEqual([{ version_id: 'base', content_edit_image_input_hash: null }]);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(facts);
  expect(host.sqlite.pragma('user_version', { simple: true }))
    .toBe(platform === 'desktop' ? DATABASE_SCHEMA_VERSION : COMPANION_DATABASE_VERSION);
});

it.each(['desktop', 'companion'] as const)('acknowledges an empty-image retry saved on the previous %s schema', async platform => {
  const host = device(); const peer = device(); const base = textBranch('base', 'Original');
  await host.receive([base]); await peer.receive([base]);
  host.sqlite.exec(`ALTER TABLE node_version_local_origins DROP COLUMN content_edit_image_input_hash`);
  host.sqlite.pragma(`user_version = ${platform === 'desktop' ? 162 : 91}`);
  const saved = textBranch('old-edit', 'Saved before upgrade', base, now);
  await applyEditorSyncNodeRecord(host.db, saved);
  const facts = host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  if (platform === 'desktop') initializeDatabaseSchema(host.sqlite);
  else await migrateCompanionDatabase(host.db, 91, COMPANION_DATABASE_VERSION);
  const input = { nodeId: 'topic', baseContent: 'Original', baseVersionId: 'base', versionId: 'old-edit',
    content: 'Saved before upgrade', title: 'Topic', hideTitleHeading: false, hostName: 'old-edit', updatedAt: now };
  const result = await applyLocalContentEdit(host.db, input);
  expect(result.submittedVersionId).toBe('old-edit');
  expect(result.current.version_id).toBe('old-edit');
  expect(host.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(facts);
  await expect(applyLocalContentEdit(host.db, { ...input, newImageReferences: [image] }))
    .rejects.toThrow('content_edit_version_mismatch');
  await expect(applyLocalContentEdit(host.db, { ...input, content: 'Different body' }))
    .rejects.toThrow('content_edit_version_mismatch');
  await peer.receive([saved]);
  await expect(applyLocalContentEdit(peer.db, input)).rejects.toThrow('content_edit_version_mismatch');
});
