// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { handleEditorHoldCommand } from './storageEditorHoldCommands.js';

const state = vi.hoisted(() => ({ sqlite: null as Database.Database | null }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ sqlite: state.sqlite })
}));

beforeEach(() => {
  state.sqlite = new Database(':memory:');
  initializeDatabaseSchema(state.sqlite);
  state.sqlite.prepare(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
    VALUES ('node', 'topic', 'Node', 'now', 'now')`).run();
  state.sqlite.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
     content_hash, body_text, snapshot_json)
    VALUES ('base', 'node', NULL, 'desktop', 'now', 'hash', 'body',
      '{"id":"node","content":"body"}')`).run();
});

afterEach(() => { state.sqlite?.close(); state.sqlite = null; });

it('validates and persists a desktop editor hold through the native command route', async () => {
  const args = { holdId: 'desktop:session', nodeId: 'node', versionId: 'base' };
  await expect(handleEditorHoldCommand(NATIVE_COMMANDS.retainNodeEditorBase, args))
    .resolves.toEqual({ retained: true });
  expect(state.sqlite!.prepare('SELECT object_id, version_id FROM node_version_local_holds').all())
    .toEqual([{ object_id: 'node', version_id: 'base' }]);
  await expect(handleEditorHoldCommand(NATIVE_COMMANDS.releaseNodeEditorBase, args))
    .resolves.toEqual({ released: true });
  expect(state.sqlite!.prepare('SELECT 1 FROM node_version_local_holds').all()).toEqual([]);
});

it('refuses malformed or unavailable editor bases', async () => {
  await expect(handleEditorHoldCommand(NATIVE_COMMANDS.retainNodeEditorBase, {
    holdId: 'desktop:session', nodeId: 'node', versionId: 'unknown'
  })).rejects.toThrow('content_edit_base_unavailable');
  await expect(handleEditorHoldCommand(NATIVE_COMMANDS.retainNodeEditorBase, {
    holdId: '', nodeId: 'node', versionId: 'base'
  })).rejects.toThrow();
  expect(state.sqlite!.prepare('SELECT 1 FROM node_version_local_holds').all()).toEqual([]);
});
