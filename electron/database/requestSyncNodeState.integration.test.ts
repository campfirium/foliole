// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';

import { closeLibraries, createPeer, edit, joinPeers, startLibraries } from './syncEmptyLibraryTestSupport.js';
import { syncRequestLibrary } from './syncRequestLibrary.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('preserves original node snapshots and author metadata through request transfer and reopening', async () => {
  const source = createPeer('Desktop author');
  const target = createPeer('Android receiver');
  joinPeers(source, target);
  const version = edit(source, 'Complete original body😀', 'Original title');
  const columns = 'version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json';
  const original = source.db.prepare(`SELECT ${columns} FROM node_sync_versions WHERE version_id = ?`).get(version) as { snapshot_json: string; [key: string]: unknown };
  expect(original).toMatchObject({ host_name: 'Desktop author', body_text: 'Complete original body😀' });

  await syncRequestLibrary(source, target);
  await syncRequestLibrary(source, target);

  const reopened = new Database(target.file, { readonly: true });
  try {
    const received = reopened.prepare(`SELECT ${columns} FROM node_sync_versions WHERE version_id = ?`)
      .get(version) as typeof original;
    const { snapshot_json: originalJson, ...originalIdentity } = original;
    const { snapshot_json: receivedJson, ...receivedIdentity } = received;
    expect(receivedIdentity).toEqual(originalIdentity);
    expect(JSON.parse(receivedJson)).toEqual({ ...JSON.parse(originalJson), content: null, position: null });
    expect(reopened.prepare('SELECT current_version_id, title, content FROM nodes WHERE id = ?').get('topic'))
      .toEqual({ current_version_id: version, title: 'Original title', content: 'Complete original body😀' });
    expect(reopened.prepare(`SELECT current_version_id, last_modified_by_host_name, sync_dirty
      FROM sync_object_state WHERE object_type = 'node' AND object_id = 'topic'`).get())
      .toEqual({ current_version_id: version, last_modified_by_host_name: 'Desktop author', sync_dirty: 0 });
  } finally { reopened.close(); }
});

it('syncs workspace settings while preserving each device private settings after reopening', async () => {
  const source = createPeer('Desktop author');
  const target = createPeer('Android receiver');
  joinPeers(source, target);
  const payload = { form_factor: 'phone', host_name: '*', key: 'search_aliases_document', platform: 'android',
    scope: 'user_space', value_json: '{"aliases":["original"]}' };
  const objectId = 'user_space:android:phone:*:search_aliases_document';
  const privatePayload = { ...payload, host_name: 'Android receiver', key: 'theme', scope: 'host',
    value_json: '{"mode":"light"}' };
  for (const [peer, value] of [[source, '{"mode":"dark"}'], [target, privatePayload.value_json]] as const) {
    const localPayload = { ...privatePayload, value_json: value };
    await peer.port.transaction(tx => applySyncObjectInTransaction(tx, {
      object_id: 'host:android:phone:Android receiver:theme', object_type: 'setting',
      content_hash: computeSyncContentHash('setting', localPayload), payload_json: JSON.stringify(localPayload),
      updated_at: '2026-05-04T01:01:00.000Z', deleted_at: null
    }, { hostName: privatePayload.host_name }));
  }
  const contentHash = computeSyncContentHash('setting', payload);
  await source.port.transaction(tx => applySyncObjectInTransaction(tx, {
    object_id: objectId, object_type: 'setting', content_hash: contentHash,
    payload_json: JSON.stringify(payload), updated_at: '2026-05-04T01:01:00.000Z', deleted_at: null
  }));

  await syncRequestLibrary(source, target);
  await syncRequestLibrary(source, target);

  const reopened = new Database(target.file, { readonly: true });
  try {
    expect(reopened.prepare(`SELECT scope, platform, form_factor, host_name, key, value_json
      FROM setting_records WHERE key = 'search_aliases_document'`).all()).toEqual([payload]);
    expect(reopened.prepare(`SELECT scope, platform, form_factor, host_name, key, value_json
      FROM setting_records WHERE key = 'theme'`).all()).toEqual([privatePayload]);
    expect(source.db.prepare("SELECT value_json FROM setting_records WHERE key = 'theme'").pluck().get())
      .toBe('{"mode":"dark"}');
    expect(reopened.prepare(`SELECT object_id, content_hash, deleted_at, sync_dirty
      FROM sync_object_state WHERE object_type = 'setting' AND object_id = ?`).get(objectId))
      .toEqual({ object_id: objectId, content_hash: contentHash, deleted_at: null, sync_dirty: 0 });
  } finally { reopened.close(); }
});
