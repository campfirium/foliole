import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort';
import { createDesktopFramedSyncFiles } from '../../../../../../electron/sync/desktopFramedSyncFiles';
import { ATTACHMENT_DEMAND_SCHEMA } from '../../../../../../lib/core/database/attachmentDemandSchema.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';
import type { FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort';
import { createMarkdownImageWidgetDom, disposeMarkdownImageWidgetDom } from '../../../../../features/editor/adapters/liveMarkdownImages';
import { resetAttachmentResourceResolutionCacheForTest } from '../../../attachmentResources';

const native = vi.hoisted(() => ({ db: null as DbPort | null, files: null as FramedSyncFilePort | null,
  access: vi.fn(), resolve: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true,
  convertFileSrc: (url: string) => url }, registerPlugin: () => ({}) }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionAttachmentResourceRuntime: () => true,
  FolioleCompanionSync: { accessFramedSyncFile: native.access, resolveAttachmentResource: native.resolve }
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => ({
  read: (task: (db: DbPort) => unknown) => task(native.db!),
  runWriter: (task: (db: DbPort) => unknown) => task(native.db!)
}) }));
vi.mock('./companionFramedSyncFiles', () => ({ currentCompanionFramedSyncFiles: () => native.files!, createCompanionFramedSyncFiles: () => native.files! }));


import { createCompanionAttachmentHost } from './companionAttachmentBlockFiles';

const bytes = Buffer.from('verified native bytes');
const hash = createHash('sha256').update(bytes).digest('hex');
const key = `${hash}.png`;
const bodyHash = 'a'.repeat(64);
const body = `![restored](asset://${key})`;

function seed(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE framed_sync_resource_availability (hash TEXT PRIMARY KEY, available INTEGER);
    CREATE TABLE sync_group_local_state (singleton_id INTEGER, state TEXT, group_id TEXT,
    local_device_identity_key TEXT);
    INSERT INTO sync_group_local_state VALUES (1, 'active', 'group', 'mobile');
    CREATE TABLE node_version_local_proof_state (singleton_id INTEGER, library_epoch TEXT);
    INSERT INTO node_version_local_proof_state VALUES (1, 'mobile-epoch');
    CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT, body_blob_hash TEXT,
      content TEXT, resource_references TEXT, deleted_at TEXT);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
      content_hash TEXT, snapshot_json TEXT)`);
  for (const sql of ATTACHMENT_DEMAND_SCHEMA) sqlite.exec(sql);
  sqlite.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?, NULL)').run('article', 'version', bodyHash, body, '[]');
  sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?)')
    .run('version', 'article', 'c'.repeat(64), JSON.stringify({ body_blob_hash: bodyHash }));
}

let root = '';
let sqlite: Database.Database | undefined;
let widget: HTMLElement | undefined;
let attachment = '';

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'foliole-resource-image-'));
  sqlite = new Database(path.join(root, 'library.db'));
  attachment = path.join(root, key);
  native.resolve.mockImplementation(async () => {
    try { await readFile(attachment); return { status: 'ready', resource_url: `file://${attachment}`, mime_type: 'image/png' }; }
    catch { return { status: 'missing_file' }; }
  });
  widget = createMarkdownImageWidgetDom({ alt: 'restored', attachmentId: hash, display: 'block',
    from: 0, source: `asset://${key}`, to: body.length });
  seed(sqlite);
  native.db = createBetterSqliteDbPort(sqlite);
  native.files = createDesktopFramedSyncFiles(path.join(root, 'transport'));
}, 20000);

afterEach(async () => {
  if (widget) { disposeMarkdownImageWidgetDom(widget); widget.remove(); }
  resetAttachmentResourceResolutionCacheForTest();
  sqlite?.close();
  native.db = null;
  native.files = null;
  if (root) await rm(root, { recursive: true, force: true });
  root = ''; sqlite = undefined; widget = undefined;
});

it('shows an already missing image after current attachment completion without changing its body', async () => {
  if (!widget || !sqlite || !native.files) throw new Error('image_recovery_fixture_missing');
  const image = widget;
  document.body.append(image);
  await waitFor(() => expect(image.querySelector('[data-md-image-status="unavailable"]')).not.toBeNull());
  const partial = path.join(root, 'partial');
  native.access.mockImplementation(async (input: { action: string; partial?: boolean; base64?: string; length?: number }) => {
    const file = input.partial ? partial : attachment;
    if (input.action === 'acquire') return {};
    if (input.action === 'stat') {
      const data = await readFile(file).catch(() => null);
      return { present: data !== null, length: data?.length ?? 0,
        hash: data ? createHash('sha256').update(data).digest('hex') : '' };
    }
    if (input.action === 'truncate') { await writeFile(partial, Buffer.alloc(input.length!)); return {}; }
    if (input.action === 'append') { await appendFile(partial, Buffer.from(input.base64!, 'base64')); return {}; }
    if (input.action === 'hash') return { hash: createHash('sha256').update(await readFile(partial)).digest('hex') };
    if (input.action === 'publish') { await rename(partial, attachment); return {}; }
    throw new Error('unexpected_attachment_operation');
  });
  const db = { files: native.files, readSnapshot: <T>(run: (port: DbPort) => Promise<T>) => run(native.db!),
    write: <T>(run: (port: DbPort) => Promise<T>) => run(native.db!) };
  const receiver = await createCompanionAttachmentHost(db, { library_key: '/fixture', generation_id: 'generation' });
  const resource = { storageKey: key, byteLength: bytes.length };
  expect(await receiver.status(resource)).toEqual({ kind: 'partial', offset: 0 });
  expect(image.querySelector('img')).toBeNull();
  expect(await receiver.receive(resource, 0, bytes)).toEqual({ kind: 'complete', offset: bytes.length });
  expect(await readFile(attachment, 'utf8')).toBe('verified native bytes');
  expect(sqlite.prepare('SELECT content FROM nodes').pluck().get()).toBe(body);
  await waitFor(() => expect(image.querySelector('.cm-md-image-element'))
    .toHaveAttribute('src', `file://${attachment}`));
});
