import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { vi } from 'vitest';

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
import { serializeNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import { stageNodeVersionPush } from '../../lib/core/sync/nodeVersionPushRetention.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { flushNodeSyncVersion } from '../database/nodeSyncVersions.js';
import { createDesktopSyncGroup, registerSyncGroupDevice } from '../database/syncGroupStore.js';
import type { DesktopTaskContext } from '../desktopTaskTypes.js';

export const migrationFixture = { root: '', assetsDir: '', appDataDir: '' };
export const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=', 'base64');
export const imageHash = createHash('sha256').update(imageBytes).digest('hex');
export const oldKey = `${imageHash}.webp`;
export const newKey = `${imageHash}.png`;

export function migrationContext(): DesktopTaskContext {
  return { signal: new AbortController().signal, hasHigherPriorityPending: () => false,
    yieldIfNeeded: vi.fn(async () => {}), progress: vi.fn(), logger: { info: vi.fn(), error: vi.fn() } };
}

export async function initializeMigrationFixture() {
  migrationFixture.root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-image-migration-'));
  migrationFixture.appDataDir = path.join(migrationFixture.root, 'data');
  migrationFixture.assetsDir = path.join(migrationFixture.root, 'Assets');
  await fs.mkdir(migrationFixture.assetsDir, { recursive: true });
  initializeDatabase();
}

export async function stageMigrationSend(versionId: string) {
  const connection = openDatabaseConnection();
  const local = createSyncGroupDeviceIdentity({ device_anchor: randomUUID(), group_id: 'group',
    library_path: connection.dbPath, path_flavor: 'posix' });
  const receiver = createSyncGroupDeviceIdentity({ device_anchor: randomUUID(), group_id: 'group',
    library_path: path.join(migrationFixture.root, 'receiver.db'), path_flavor: 'posix' });
  createDesktopSyncGroup({ device: local, deviceName: 'Source', platform: 'mac', now: 'now' });
  registerSyncGroupDevice({ device: receiver, deviceName: 'Receiver', platform: 'mac', now: 'now' });
  await stageNodeVersionPush(createBetterSqliteDbPort(connection.sqlite), receiver.identity_key,
    'migration-send', 'article', versionId, 'now');
}

export function seedMigrationNode(id: string, content: string, parentId: string | null = null, anchor: unknown = null) {
  upsertNodeSnapshot({ nodeId: id, parentNodeId: parentId, kind: 'topic', title: id, content,
    position: 0, anchorLink: anchor as null, reveal: null, isTitleManual: true,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
  const references = serializeNodeResourceReferences([
    { storage_key: oldKey, role: 'image', original_name: 'Original.jpg' }
  ]);
  if (!parentId) openDatabaseConnection().driver.execute('UPDATE nodes SET resource_references = ? WHERE id = ?', [references, id]);
  flushNodeSyncVersion(id);
}

export function migrationNode(id = 'article') {
  return openDatabaseConnection().driver.queryOne<{ content: string; resource_references: string;
    current_version_id: string; anchor_link: string; image_sources: string }>(`SELECT n.*, ${buildNodeBodyContentSql()} AS content FROM nodes n
      LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ?`, [id])!;
}
