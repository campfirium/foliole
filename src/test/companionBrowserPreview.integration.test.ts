// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds';
import {
  COMPANION_PREVIEW_PLATFORM, createCompanionPreviewBridge, createCompanionPreviewPlugins, installCompanionPreviewHost
} from '../../scripts/vite/companionPreviewHost';
import {
  handleCompanionPreviewSqlite, readCompanionPreviewHostName, resolveCompanionPreviewAttachment
} from '../../scripts/vite/companionPreviewServer';
import { createCompanionPreviewSqliteHost } from '../../scripts/vite/companionPreviewSqliteHost';

// `@capacitor/core` lives outside the module reset and keeps the first bridge object it saw,
// so each preview open refreshes that same object, as a page load would seed a fresh one.
const host: { Capacitor?: Record<string, unknown> } = {};
beforeAll(() => {
  installCompanionPreviewHost(host, 'unused');
  Object.assign(globalThis, host);
});

let root: string;
let file: string;
let sqlite: ReturnType<typeof createCompanionPreviewSqliteHost>;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'companion-preview-'));
  file = path.join(root, 'foliole-companionSQLite.db');
  sqlite = createCompanionPreviewSqliteHost(file);
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    const attachment = url.match(/^\/__foliole_preview\/attachments\/(.+)$/u)?.[1];
    if (attachment) return { ok: resolveCompanionPreviewAttachment(file, attachment) !== null };
    const { payload } = await handleCompanionPreviewSqlite(sqlite, init.body);
    return { ok: true, json: async () => payload };
  });
});

afterEach(async () => {
  const { closeIosCompanionDatabase } = await import('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap');
  await closeIosCompanionDatabase();
  sqlite.close();
  vi.unstubAllGlobals();
  vi.resetModules();
  rmSync(root, { force: true, recursive: true });
});

async function openPreview() {
  vi.resetModules();
  Object.assign(host.Capacitor!, createCompanionPreviewBridge(createCompanionPreviewPlugins(readCompanionPreviewHostName(file))));
  const { loadCompanionBootstrapState } = await import('../shared/platform/companionBootstrap');
  return loadCompanionBootstrapState();
}

it('creates the preview library on disk through the production companion bootstrap', async () => {
  const state = await openPreview();

  expect(state).toMatchObject({ database_path: file, database_ready: true, host_name: 'Web preview' });
  expect(existsSync(file)).toBe(true);
  const { refreshCompanionWorkspaceSnapshot } = await import('../shared/platform/companion/companionWorkspaceSnapshotRefresh');
  expect((await refreshCompanionWorkspaceSnapshot())?.nodesById).toHaveProperty([INBOX_NODE_ID]);
});

it('opens a copied device library under its own host and reads its content through snapshots', async () => {
  await openPreview();
  const { closeIosCompanionDatabase } = await import('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap');
  await closeIosCompanionDatabase();
  const copy = new Database(file);
  copy.prepare("UPDATE companion_meta SET value = 'Phone' WHERE key = 'host_name'").run();
  copy.prepare("INSERT INTO nodes (id, title, content, created_at, updated_at) VALUES ('n1', 'Copied', '', 'now', 'now')").run();
  copy.close();

  const state = await openPreview();
  const { getIosCompanionDatabaseOwner } = await import('../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap');
  const rows = await getIosCompanionDatabaseOwner().readSnapshot((db) =>
    db.query<{ title: string }>("SELECT title FROM nodes WHERE id = 'n1'"));

  expect(state.host_name).toBe('Phone');
  expect(rows).toEqual([{ title: 'Copied' }]);
});

it('opens local database features while sync and network stay with the native host', async () => {
  await openPreview();
  const runtime = await import('../shared/platform/companionWorkspaceRuntimeRepository');
  const capabilities = await import('../shared/platform/companionRuntimeCapabilities');

  expect(capabilities.getCompanionRuntimeCapability()).toEqual({ kind: 'browser-preview', platform: COMPANION_PREVIEW_PLATFORM });
  expect(capabilities.COMPANION_BROWSER_PREVIEW_PLATFORM).toBe(COMPANION_PREVIEW_PLATFORM);
  expect(runtime.isAvailableNativeCompanionRuntime()).toBe(true);
  expect(runtime.isNativeCompanionReviewWriteRuntime()).toBe(true);
  expect(capabilities.isCompanionNativeHost()).toBe(false);
  expect(runtime.isNativeCompanionNetworkRuntime()).toBe(false);
  await expect(runtime.beginNativeCompanionSyncRun('manual', 'run-1')).rejects.toThrow('not implemented');
});

it('resolves attachments copied beside the library and reports the rest as missing files', async () => {
  const storageKey = `${'a'.repeat(64)}.png`;
  mkdirSync(path.join(root, 'files', 'attachments'), { recursive: true });
  writeFileSync(path.join(root, 'files', 'attachments', storageKey), 'png');
  writeFileSync(path.join(root, 'outside.png'), 'png');
  await openPreview();
  const { resolveRuntimeAttachmentResource } = await import('../shared/platform/attachmentResources');

  expect(await resolveRuntimeAttachmentResource(`asset://${storageKey}`)).toEqual({
    mime_type: 'image/png', resource_url: `/__foliole_preview/attachments/${storageKey}`, status: 'ready'
  });
  expect(await resolveRuntimeAttachmentResource(`asset://${'b'.repeat(64)}.png`)).toMatchObject({ status: 'missing_file' });
  expect(resolveCompanionPreviewAttachment(file, encodeURIComponent('../../outside.png'))).toBeNull();
});
