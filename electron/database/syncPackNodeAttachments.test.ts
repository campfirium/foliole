// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';

import { openDatabaseConnection } from './connection.js';
import { persistNodeResourceReference } from './nodeResources.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { mockedRequestProjectionAppDataDir, ownerPort, projectionPeer,
  setupRequestProjection, transferProjection } from './requestProjection.testSupport.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedRequestProjectionAppDataDir,
  app_cache_dir: path.join(mockedRequestProjectionAppDataDir, 'cache'),
  app_config_dir: path.join(mockedRequestProjectionAppDataDir, 'config'),
  app_log_dir: path.join(mockedRequestProjectionAppDataDir, 'logs')
}) }));
setupRequestProjection();

function seedSyncedNode() {
  const driver = openDatabaseConnection().driver;
  const now = '2026-04-27T00:00:00.000Z';
  const bodyHash = upsertTextBodyBlob(driver, 'node body', now);
  driver.execute(
    `INSERT INTO nodes (
       id, kind, title, is_title_manual, hide_title_heading, opening_text,
       content, body_blob_hash, created_at, updated_at
     ) VALUES (?, 'topic', ?, 1, 0, ?, ?, ?, ?, ?)`,
    ['node-1', 'Node 1', 'Node opening preview', 'node body', bodyHash, now, now]
  );
  expect(flushNodeSyncVersionWithDriver(driver, 'node-1', 'Desktop test host', now, 'original-version'))
    .toBe('original-version');
}

it('persists node attachment references through a current request, replay and receiver reopen', async () => {
  seedSyncedNode();
  const reference = { storage_key: `${'a'.repeat(64)}.png`, original_name: 'cover.png', role: 'image' as const };
  expect(persistNodeResourceReference('node-1', reference)).toBe('created');
  const source = openDatabaseConnection().sqlite;
  const versionId = source.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").pluck().get();
  expect(versionId).not.toBe('original-version');
  const columns = 'version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text';
  const original = source.prepare(`SELECT ${columns} FROM node_sync_versions WHERE version_id = ?`).get(versionId);
  expect(original).toMatchObject({ object_id: 'node-1', parent_version_id: 'original-version', body_text: 'node body' });
  const parents = source.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all();
  const target = projectionPeer('target');

  for (let attempt = 0; attempt < 2; attempt++) {
    await transferProjection(ownerPort(), target.db);
    target.reopen();
    const node = target.sqlite.prepare(`SELECT id, content, current_version_id, resource_references
      FROM nodes WHERE id = 'node-1'`).get() as { id: string; content: string; current_version_id: string; resource_references: string };
    expect({ id: node.id, content: node.content, current_version_id: node.current_version_id })
      .toEqual({ id: 'node-1', content: 'node body', current_version_id: versionId });
    expect(JSON.parse(node.resource_references)).toEqual([reference]);
    expect(target.sqlite.prepare(`SELECT ${columns} FROM node_sync_versions WHERE version_id = ?`).get(versionId))
      .toEqual(original);
    expect(target.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all()).toEqual(parents);
    expect(target.sqlite.prepare(`SELECT object_id, object_type, current_version_id FROM sync_object_state
      WHERE object_type = 'node' AND object_id = 'node-1'`).get())
      .toEqual({ object_id: 'node-1', object_type: 'node', current_version_id: versionId });
  }
});
