import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort';
import { createDesktopFramedSyncFiles } from '../../../../../../electron/sync/desktopFramedSyncFiles';
import { initializeDatabaseSchema } from '../../../../../../lib/core/database/migrations';
import type { NativeCompanionFramedFileRequest } from '../../../../../../lib/platform/nativeCompanionFramedFilesContract';

const native = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true,
  convertFileSrc: (url: string) => url }, registerPlugin: () => ({}) }));
vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionAttachmentResourceRuntime: () => true,
  FolioleCompanionSync: { accessFramedSyncFile: native.access }
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => {
  throw new Error('An explicit test owner is required');
} }));
vi.mock('./companionPdfTextArtifact', () => ({ importCompanionPdfTextArtifact: vi.fn(async () => undefined) }));

import { createCompanionAttachmentHost } from './companionAttachmentBlockFiles';
import { companionAttachmentNativeFiles } from './companionAttachmentNativeFiles.testSupport';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/pdf-text-presence-'));
  roots.push(root);
  const sqlite = new Database(path.join(root, 'library.db'));
  initializeDatabaseSchema(sqlite);
  const port = createBetterSqliteDbPort(sqlite);
  const actions: NativeCompanionFramedFileRequest[] = [];
  const files = companionAttachmentNativeFiles(root);
  native.access.mockImplementation(async (input: NativeCompanionFramedFileRequest) => { actions.push(input); return files(input); });
  const host = await createCompanionAttachmentHost({ files: createDesktopFramedSyncFiles(path.join(root, 'transport')),
    readSnapshot: read => read(port), write: write => write(port) }, { library_key: root, generation_id: 'generation' });
  const pdf = `${'a'.repeat(64)}.pdf`;
  sqlite.prepare('INSERT INTO attachment_pending VALUES (?,?,?,?,?)').run('article', pdf, 'body', 'now', null);
  const pending = () => sqlite.prepare('SELECT count(*) FROM attachment_pending WHERE storage_key = ?').pluck().get(pdf);
  return { root, host, pdf, actions, pending, close: () => sqlite.close() };
}

it('completes a stored PDF demand after text import without asking the host for its digest', async () => {
  const f = await fixture();
  try {
    await writeFile(path.join(f.root, f.pdf), Buffer.alloc(256 * 1024, 0x25));
    await f.host.importPdfText!(f.pdf, `${'b'.repeat(64)}.txt`);
    expect(f.pending()).toBe(0);
    expect(f.actions.filter(input => input.operation === 'attachment' &&
      (input.action === 'stat' || input.action === 'hash'))).toEqual([]);
    expect(f.actions).toContainEqual(expect.objectContaining({ action: 'source-stat-batch', keys: [f.pdf] }));
  } finally { f.close(); }
});

it('keeps the PDF demand when the PDF itself is not stored yet', async () => {
  const f = await fixture();
  try {
    await f.host.importPdfText!(f.pdf, `${'b'.repeat(64)}.txt`);
    expect(f.pending()).toBe(1);
  } finally { f.close(); }
});
