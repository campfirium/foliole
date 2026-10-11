import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort';
import { createDesktopFramedSyncFiles } from '../../../../../../electron/sync/desktopFramedSyncFiles';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';
import type { FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort';
import { createMarkdownImageWidgetDom, disposeMarkdownImageWidgetDom } from '../../../../../features/editor/adapters/liveMarkdownImages';
import { resetAttachmentResourceResolutionCacheForTest } from '../../../attachmentResources';

const native = vi.hoisted(() => ({ db: null as DbPort | null, files: null as FramedSyncFilePort | null,
  pull: vi.fn(), resolve: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true,
  convertFileSrc: (url: string) => url }, registerPlugin: () => ({}) }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionAttachmentResourceRuntime: () => true,
  FolioleCompanionSync: { pullFramedSyncObject: native.pull, resolveAttachmentResource: native.resolve }
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => ({
  read: (task: (db: DbPort) => unknown) => task(native.db!),
  runWriter: (task: (db: DbPort) => unknown) => task(native.db!)
}) }));
vi.mock('./companionFramedSyncFiles', () => ({ currentCompanionFramedSyncFiles: () => native.files! }));


import { runCompanionFramedSyncResourceRound } from './companionFramedSyncResourceRound';

const hash = 'b'.repeat(64);
const key = `${hash}.png`;
const bodyHash = 'a'.repeat(64);
const body = `![restored](asset://${key})`;
const request = { endpoint_url: 'http://desktop:43110', receiver_device_id: 'desktop',
  receiver_library_epoch: 'desktop-epoch', sync_group_id: 'group' };

function seed(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE sync_group_local_state (singleton_id INTEGER, state TEXT, group_id TEXT,
    local_device_identity_key TEXT);
    INSERT INTO sync_group_local_state VALUES (1, 'active', 'group', 'mobile');
    CREATE TABLE node_version_local_proof_state (singleton_id INTEGER, library_epoch TEXT);
    INSERT INTO node_version_local_proof_state VALUES (1, 'mobile-epoch');
    CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT, body_blob_hash TEXT,
      content TEXT, resource_references TEXT, deleted_at TEXT);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
      content_hash TEXT, snapshot_json TEXT)`);
  sqlite.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?, NULL)').run('article', 'version', bodyHash, body, '[]');
  sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?)')
    .run('version', 'article', 'c'.repeat(64), JSON.stringify({ body_blob_hash: bodyHash }));
}

it('shows an already missing image after a background resource round without changing its body', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-resource-image-'));
  const sqlite = new Database(path.join(root, 'library.db'));
  const attachment = path.join(root, key);
  native.resolve.mockImplementation(async () => {
    try { await readFile(attachment); return { status: 'ready', resource_url: `file://${attachment}`, mime_type: 'image/png' }; }
    catch { return { status: 'missing_file' }; }
  });
  const widget = createMarkdownImageWidgetDom({ alt: 'restored', attachmentId: hash, display: 'block',
    from: 0, source: `asset://${key}`, to: body.length });
  try {
    seed(sqlite);
    native.db = createBetterSqliteDbPort(sqlite);
    native.files = createDesktopFramedSyncFiles(path.join(root, 'transport'));
    document.body.append(widget);
    await waitFor(() => expect(widget.querySelector('[data-md-image-status="unavailable"]')).not.toBeNull());
    native.pull.mockRejectedValueOnce(new Error('framed_sync_resource_source_unavailable'));
    const failed = await runCompanionFramedSyncResourceRound(request, new Uint8Array(16), ['article']);
    expect(failed.pending).toBe(1);
    expect(widget.querySelector('img')).toBeNull();
    native.pull.mockImplementationOnce(async () => { await writeFile(attachment, 'verified native bytes'); });
    const restored = await runCompanionFramedSyncResourceRound(request, new Uint8Array(16), ['article']);
    expect(restored.transferred).toBe(1);
    expect(await readFile(attachment, 'utf8')).toBe('verified native bytes');
    expect(sqlite.prepare('SELECT content FROM nodes').pluck().get()).toBe(body);
    await waitFor(() => expect(widget.querySelector('.cm-md-image-element'))
      .toHaveAttribute('src', `file://${attachment}`));
  } finally {
    disposeMarkdownImageWidgetDom(widget);
    widget.remove();
    resetAttachmentResourceResolutionCacheForTest();
    sqlite.close();
    native.db = null;
    native.files = null;
    await rm(root, { recursive: true, force: true });
  }
});
