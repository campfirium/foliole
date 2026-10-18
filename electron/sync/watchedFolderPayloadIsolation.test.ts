// @vitest-environment node

import { expect, it } from 'vitest';

import { applyWatchedFolderObject } from '../../lib/core/sync/syncObjectWatchedFolderPayloadExecutor.js';
import { restoreFixture, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { publish, state, withSnapshot } from './watchedFolderPayloadIsolation.testSupport.js';

const shared = { action_mode: 'keep', binding_id: 'watched-a', connection_status: 'connected',
  created_at: 'now', highlight_mode: 'split', host_name: 'Remote Mac', host_platform: 'macOS',
  owner_device_identity_key: 'remote-device', reported_path: '/remote/private', source_ref: 'watched:watched-a' };

function seedLocal(peer: RestorePeer) {
  peer.sqlite.prepare(`INSERT INTO desktop_sources
    (source_ref, source_type, config_ref, host_name, host_platform, root_path,
     path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('watched:watched-a', 'watched', 'watched-a', 'Local Mac', 'macOS',
      '/local/private', 'posix', '{"highlightPath":"/local/highlights"}', 'now', 'now')`).run();
  peer.sqlite.prepare(`INSERT INTO watched_folder_bindings
    (binding_id, connection_status, action_mode, highlight_mode, primary_path,
     created_at, updated_at, source_ref, owner_device_identity_key)
    VALUES ('watched-a', 'connected', 'keep', 'split', '/local/private', 'now', 'now',
      'watched:watched-a', 'local-device')`).run();
}

function expectPaths(peer: RestorePeer) {
  expect(peer.sqlite.prepare(`SELECT root_path, type_settings_json FROM desktop_sources
    WHERE source_ref = 'watched:watched-a'`).get()).toEqual({
    root_path: '/local/private', type_settings_json: '{"highlightPath":"/local/highlights"}'
  });
  expect(peer.sqlite.prepare(`SELECT owner_device_identity_key, primary_path, reported_path FROM watched_folder_bindings
    WHERE binding_id = 'watched-a'`).get()).toEqual({
    owner_device_identity_key: 'remote-device', primary_path: '/local/private', reported_path: '/remote/private'
  });
}

it('keeps local execution paths while accepting the remote display path through request replay and reopen', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    seedLocal(target);
    await applyWatchedFolderObject(source.db, { content_hash: 'seed', deleted_at: null, object_id: 'watched-a',
      object_type: 'watched_folder', payload_json: JSON.stringify(shared), updated_at: 'later' });
    publish(source, 'watched_folder', 'watched-a');
    await withSnapshot(source, target, 'watched_folder', 'watched-a', async (replay, payload) => {
      expect(payload).toMatchObject(shared);
      for (let attempt = 0; attempt < 2; attempt++) { await replay(); target.reopen(); expectPaths(target); }
      const before = state(target);
      for (const field of ['primary_path', 'root_path']) {
        await expect(replay({ [field]: '/remote/private' })).rejects.toThrow('invalid_watched_folder_payload');
        target.reopen(); expect(state(target)).toEqual(before);
      }
    });
  } finally { await fixture.close(); }
});

function seedImport(peer: RestorePeer) {
  peer.sqlite.prepare(`INSERT INTO import_sources
    (source_fingerprint, provider, source_kind, source_name, source_locator,
     first_imported_at, last_imported_at, last_content_fingerprint, watched_binding_id, watched_relative_path, latest_node_id)
    VALUES ('source', 'markdown', 'file', 'note.md', '/local/private/note.md',
      'now', 'now', 'content', 'watched-a', 'note.md', 'topic')`).run();
}

it('publishes no watched import locator while preserving its local historical value through requests', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target'); const empty = fixture.peer('observer');
  try {
    await source.seed('topic'); await target.seed('topic');
    seedImport(source); seedImport(target);
    publish(source, 'import_source', 'source');
    await withSnapshot(source, target, 'import_source', 'source', async (replay, payload) => {
      expect(payload).toMatchObject({ source_locator: '', watched_relative_path: 'note.md' });
      for (let attempt = 0; attempt < 2; attempt++) {
        await replay(); target.reopen();
        expect(target.sqlite.prepare("SELECT source_locator FROM import_sources WHERE source_fingerprint = 'source'")
          .pluck().get()).toBe('/local/private/note.md');
      }
      const before = state(target);
      await expect(replay({ source_locator: '/remote/private/note.md' }))
        .rejects.toThrow('invalid_watched_import_source_locator');
      target.reopen(); expect(state(target)).toEqual(before);
    });
    source.sqlite.prepare(`INSERT INTO desktop_sources
      (source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, created_at, updated_at)
      VALUES ('watched:old', 'watched', 'old', 'Local Mac', 'macOS', '/local/old', 'posix', '{}', 'now', 'now')`).run();
    source.sqlite.exec("UPDATE import_sources SET watched_binding_id = NULL, source_ref = 'watched:old'");
    expect(publish(source, 'import_source', 'source').source_locator).toBe('');
    await withSnapshot(source, empty, 'import_source', 'source', async (replay, payload) => {
      expect(payload).toMatchObject({ watched_binding_id: null, source_locator: '', source_ref: 'watched:old' });
      for (let attempt = 0; attempt < 2; attempt++) {
        await replay(); empty.reopen();
        expect(empty.sqlite.prepare('SELECT source_locator FROM import_sources').pluck().get()).toBe('');
      }
    });
    expect(source.sqlite.prepare('SELECT source_locator FROM import_sources').pluck().get()).toBe('/local/private/note.md');
  } finally { await fixture.close(); }
});
