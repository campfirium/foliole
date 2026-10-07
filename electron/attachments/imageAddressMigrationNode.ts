import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { parseNodeResourceReferences, serializeNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import { applyParentContentChange } from '../../lib/core/database/parentContentMutation.js';
import { collectArticleImageStorageKeys, replaceArticleImageSource } from '../../lib/core/import/replaceArticleImageSource.js';
import { flushNodeSyncVersionWithDriver } from '../database/nodeSyncVersionFromDriver.js';

import type { VerifiedMigrationImage } from './imageAddressMigrationFiles.js';

function isSameImage(key: string, image: VerifiedMigrationImage) {
  return key.startsWith(`${image.contentHash}.`) && key !== image.storageKey;
}

function remapReferences(value: string | null, image: VerifiedMigrationImage) {
  const references = parseNodeResourceReferences(value);
  const unique = new Map<string, (typeof references)[number]>();
  for (const row of references) {
    const storageKey = row.role === 'image' && isSameImage(row.storage_key, image)
      ? image.storageKey : row.storage_key;
    const identity = `${storageKey}:${row.role}`;
    const previous = unique.get(identity);
    unique.set(identity, { ...row, storage_key: storageKey,
      original_name: previous?.original_name ?? row.original_name });
  }
  return serializeNodeResourceReferences([...unique.values()]);
}

function remapSources(value: string | null, keys: string[], target: string) {
  if (!value) return value;
  const sources = JSON.parse(value) as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in sources)) continue;
    if (target in sources && JSON.stringify(sources[target]) !== JSON.stringify(sources[key])) {
      throw new Error('image_migration_source_conflict');
    }
    sources[target] = sources[key];
    delete sources[key];
  }
  return JSON.stringify(sources);
}

function assertNotEditing(driver: DatabaseDriver, nodeId: string) {
  const hold = driver.queryOne(`SELECT 1 FROM node_version_local_holds
    WHERE object_id = ? OR object_id IN (SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL)
    LIMIT 1`, [nodeId, nodeId]);
  if (hold) throw new Error('image_migration_editor_active');
}

function versionChanges(driver: DatabaseDriver, ids: string[], hostName: string, now: string,
  storage: 'continuous' | 'chunked') {
  for (const id of ids) {
    driver.execute('UPDATE nodes SET sync_dirty = 1, last_modified_by_host_name = ? WHERE id = ?', [hostName, id]);
    if (!flushNodeSyncVersionWithDriver(driver, id, hostName, now, undefined, storage)) {
      throw new Error('image_migration_version_unavailable');
    }
  }
}

export function migrateImageAddressInNode(driver: DatabaseDriver, nodeId: string,
  image: VerifiedMigrationImage, hostName: string, now = new Date().toISOString(), bodyStorage: 'continuous' | 'chunked' = 'continuous') {
  return driver.transaction(() => {
    const row = driver.queryOne<{ resource_references: string | null; image_sources: string | null }>(
      'SELECT resource_references, image_sources FROM nodes WHERE id = ? AND deleted_at IS NULL', [nodeId]);
    if (!row) return false;
    const body = loadNodeBodyResolution(driver, nodeId, bodyStorage);
    if (!body || body.status !== 'resolved') throw new Error('image_migration_body_unavailable');
    const keys = collectArticleImageStorageKeys(body.content).filter((key) => isSameImage(key, image));
    const nextContent = keys.reduce((content, key) => replaceArticleImageSource(content, key, image.storageKey), body.content);
    const references = remapReferences(row.resource_references, image);
    if (nextContent === body.content && references === (row.resource_references ?? '[]')) return false;
    assertNotEditing(driver, nodeId);
    const children = driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [nodeId]);
    for (const id of [nodeId, ...children.map((child) => child.id)]) {
      flushNodeSyncVersionWithDriver(driver, id, hostName, now, undefined, bodyStorage);
    }
    const change = applyParentContentChange({ bodyStorage, driver, nodeId, nextContent, previousContent: body.content, updatedAt: now });
    if (change.skippedAnchors.some((anchor) => anchor.reason === 'invalid_anchor_link')) {
      throw new Error('image_migration_anchor_invalid');
    }
    driver.execute('UPDATE nodes SET resource_references = ?, image_sources = ?, updated_at = ? WHERE id = ?',
      [references, remapSources(row.image_sources, keys, image.storageKey), now, nodeId]);
    versionChanges(driver, [nodeId, ...change.affectedChildIds], hostName, now, bodyStorage);
    return true;
  });
}
