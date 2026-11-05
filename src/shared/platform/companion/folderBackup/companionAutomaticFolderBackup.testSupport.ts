// @vitest-environment node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, vi } from 'vitest';

import { completeFolderAttachmentCopy, prepareFolderAttachmentCopy } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import { bindCompanionAutomaticFolderBackup } from './companionAutomaticFolderBackup';

const cleanup: (() => Promise<void>)[] = [];
export async function closeAutomaticBackupFixtures() { for (const close of cleanup.splice(0)) await close(); }
export function gate() { let release!: () => void; const promise = new Promise<void>(done => { release = done; }); return { promise, release }; }
export async function automaticFolderBackupFixture(runtime: { owner: unknown; port: unknown; inventory: ReturnType<typeof vi.fn>; resume: () => void }) {
  const root = await mkdtemp(path.resolve('.tmp/artifacts/T692/automatic-'));
  const source = path.join(root, 'source');
  let target = path.join(root, 'target'); await mkdir(source); await mkdir(target);
  let library = createDisplayLibrary('android');
  await library.owner.open({ expectedHostName: 'fixture', now: '2026-11-04T00:00:00Z' });
  const sourceDb = path.join(root, 'source.sqlite');
  let stop: () => void | Promise<void> = () => {};
  let inBackup = 0, maxInBackup = 0;
  const state = { configured: true, directoryLabel: 'Backup', directoryId: 'target', databaseSavedAt: null as string | null,
    phase: 'idle' as const, errorMessage: null as string | null, attachmentFilesPending: null as number | null };
  const backup = vi.fn(async ({ requestId }: { requestId: string }) => {
    inBackup++; maxInBackup = Math.max(maxInBackup, inBackup);
    try {
      const sqlite = new Database(library.file, { readonly: true });
      try { await sqlite.backup(path.join(target, 'Foliole.sqlite')); } finally { sqlite.close(); }
      state.databaseSavedAt = new Date().toISOString();
      return { requestId, cancelled: false, databaseCommitted: true, state: { ...state } };
    } finally { inBackup--; }
  });
  const copy = vi.fn(async ({ storageKey }: { storageKey: string }) => {
    const bytes = await readFile(path.join(source, storageKey));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(storageKey.slice(0, 64));
    await copyFile(path.join(source, storageKey), path.join(target, storageKey)); return { copied: true };
  });
  const finish = vi.fn(async (input: { pending: number | null; errorMessage: string | null }) => {
    state.attachmentFilesPending = input.pending; state.errorMessage = input.errorMessage; return { ...state };
  });
  const forget = vi.fn(async () => { state.configured = false; state.directoryId = ''; return { ...state }; });
  runtime.port = { clearDirectory: forget, getState: async () => ({ ...state }), openSource: async () => {}, closeSource: async () => {},
    backupDatabase: backup, prepareAttachmentDirectory: async () => {}, copyAttachment: copy, finishAttachments: finish,
    cancelDatabase: async () => {} } as unknown as CompanionFolderBackupPort;
  runtime.inventory.mockImplementation(async ({ trash }: { trash: boolean }) => ({ files: trash ? [] :
    (await readdir(source)).map(storageKey => ({ storageKey, sizeBytes: 0 })) }));
  async function bind() { runtime.owner = library.owner; stop = await bindCompanionAutomaticFolderBackup(library.owner); }
  await bind();
  cleanup.push(async () => { await stop(); await library.close(); await rm(root, { recursive: true, force: true }); });
  const publish = async (text: string) => {
    const bytes = Buffer.from(text), key = `${createHash('sha256').update(bytes).digest('hex')}.png`;
    await library.owner.runWriter(db => prepareFolderAttachmentCopy(db, key));
    await writeFile(path.join(source, key), bytes);
    await library.owner.runWriter(db => db.transaction(tx => completeFolderAttachmentCopy(tx, key)));
    return { key, bytes };
  };
  const reopen = async () => {
    await stop(); const sqlite = new Database(library.file, { readonly: true });
    try { await sqlite.backup(sourceDb); } finally { sqlite.close(); }
    await library.close(); library = createDisplayLibrary('android', sourceDb);
    await library.owner.open({ expectedHostName: 'fixture', now: '2026-11-04T00:00:00Z' }); await bind();
  };
  const select = async () => { target = path.join(root, 'replacement'); await mkdir(target);
    state.directoryId = 'replacement'; state.configured = true; };
  return { source, get target() { return target; }, state, backup, copy, finish, forget, select, publish, reopen, get owner() { return library.owner; },
    maxInBackup: () => maxInBackup, readWork: () => library.owner.read(db => db.query('SELECT * FROM folder_attachment_work')) };
}


export { clearCompanionFolderBackupDirectory, getCompanionAutomaticFolderBackup, setCompanionAutomaticFolderBackup } from './companionAutomaticFolderBackup';
export { backUpCompanionDatabase } from './companionFolderBackup';
export { getCompanionFolderBackupState } from './companionFolderBackupState';
