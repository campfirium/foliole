// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';

import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { confirmFolderAttachmentCopy, prepareFolderAttachmentCopy } from '../../../../../lib/core/database/companionFolderAttachmentWork';

import { folderAttachmentWorkFixture } from './companionFolderAttachmentWork.testSupport';

const native = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { accessFramedSyncFile: native.access } }));
const fixtures: Awaited<ReturnType<typeof folderAttachmentWorkFixture>>[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); vi.clearAllMocks(); });
async function fixture() { const f = await folderAttachmentWorkFixture(native, createBetterSqliteDbPort); fixtures.push(f); return f; }
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }

it('uses one initial baseline, then backs up a later production receive without rescanning the directory', async () => {
  const f = await fixture();
  const first = await f.receive('first original');
  expect((await f.run()).attachmentFilesPending).toBe(0);
  expect(await readFile(first.file)).toEqual(first.bytes);
  expect(f.inventory).toHaveBeenCalledTimes(1);
  const second = await f.receive('received after the baseline');
  expect(f.rows()).toHaveLength(1);
  await f.run();
  expect(await readFile(second.file)).toEqual(second.bytes);
  expect(f.inventory).toHaveBeenCalledTimes(1);
  expect(f.rows()).toEqual([]);
});

it('persists a failed copy and its error, then resumes the same target after reopening the database', async () => {
  const f = await fixture();
  await f.run();
  const item = await f.receive('durable received bytes');
  f.port.copyAttachment.mockRejectedValueOnce(new Error('directory permission unavailable'));
  const failed = await f.run();
  expect(failed).toMatchObject({ databaseSavedAt: 'database committed', attachmentFilesPending: 1,
    errorMessage: 'directory permission unavailable' });
  expect(await f.exists(item.file)).toBe(false);
  await f.reopen();
  expect(f.rows()[0]).toMatchObject({ action: 'copy', stage: 'backup', last_error: 'directory permission unavailable' });
  await f.run();
  expect(await readFile(item.file)).toEqual(item.bytes);
  expect(f.rows()).toEqual([]);
  expect(f.inventory).toHaveBeenCalledTimes(1);
});

it('recovers a published original whose completion transaction failed without another receive or directory scan', async () => {
  const f = await fixture();
  await f.run();
  f.sqlite.exec(`CREATE TRIGGER reject_ready BEFORE INSERT ON folder_attachment_work
    WHEN NEW.stage='backup' BEGIN SELECT RAISE(ABORT,'original completion failed'); END`);
  await expect(f.receive('published but not recorded complete')).rejects.toThrow('original completion failed');
  expect(f.rows()[0]).toMatchObject({ stage: 'source' });
  f.sqlite.exec('DROP TRIGGER reject_ready');
  await f.reopen();
  const [work] = f.rows() as { storage_key: string }[];
  await f.run();
  expect(await readFile(`${f.target}/${work!.storage_key}`, 'utf8')).toBe('published but not recorded complete');
  expect(f.rows()).toEqual([]);
  expect(f.inventory).toHaveBeenCalledTimes(1);
});

it('does not hold the source database writer or the receiver while an independent target copy is slow', async () => {
  const f = await fixture();
  await f.run();
  const first = await f.receive('first slow backup');
  const started = gate(), finish = gate();
  f.port.copyAttachment.mockImplementationOnce(async input => {
    started.release(); await finish.promise; return f.copy(input);
  });
  const running = f.run();
  try {
    await started.promise;
    const second = await f.receive('new source stays writable');
    expect(await readFile(second.source)).toEqual(second.bytes);
    expect(await f.exists(first.file)).toBe(false);
    finish.release(); await running;
    expect(f.rows()).toHaveLength(1);
    await f.run(); expect(await readFile(second.file)).toEqual(second.bytes);
  } finally { finish.release(); await running; }
});

it('repeats a completed file safely if acknowledgement failed after target publication', async () => {
  const f = await fixture();
  await f.run();
  const item = await f.receive('target published before acknowledgement');
  f.sqlite.exec(`CREATE TRIGGER reject_ack BEFORE DELETE ON folder_attachment_work
    WHEN OLD.stage='backup' BEGIN SELECT RAISE(ABORT,'ack failed'); END`);
  expect((await f.run()).attachmentFilesPending).toBe(1);
  expect(await readFile(item.file)).toEqual(item.bytes);
  f.sqlite.exec('DROP TRIGGER reject_ack');
  await f.reopen();
  const state = await f.run();
  expect(state.attachmentFilesCopied).toBe(0); expect(state.attachmentFilesPending).toBe(0);
  expect(f.rows()).toEqual([]);
});

it('does not clear a later source intent when an older target copy finishes', async () => {
  const f = await fixture();
  await f.run(); const item = await f.receive('same immutable file');
  f.port.copyAttachment.mockImplementationOnce(async input => {
    const copied = await f.copy(input);
    await prepareFolderAttachmentCopy(f.db, item.key);
    return copied;
  });
  await f.run();
  expect(f.rows()[0]).toMatchObject({ stage: 'source', storage_key: item.key });
  await f.run(); expect(f.rows()).toEqual([]);
});

it('finishes both the verified source intent and its superseded older backup obligation in one attempt', async () => {
  const f = await fixture();
  await f.run(); const item = await f.receive('an existing canonical source');
  await prepareFolderAttachmentCopy(f.db, item.key);
  expect(f.rows()).toHaveLength(2);
  const state = await f.run();
  expect(await readFile(item.file)).toEqual(item.bytes);
  expect(state.attachmentFilesPending).toBe(0);
  expect(f.rows()).toEqual([]);
});

it('keeps an invalid baseline unfinished and retries it, and leaves externally changed target bytes intact', async () => {
  const f = await fixture();
  f.inventory.mockRejectedValueOnce(new Error('source directory unreadable'));
  expect((await f.run()).attachmentFilesPending).toBeNull();
  const item = await f.receive('safe source');
  await writeFile(item.file, 'external change');
  expect((await f.run()).attachmentFilesPending).toBe(1);
  expect(await readFile(item.file, 'utf8')).toBe('external change');
  expect(f.rows()[0]).toMatchObject({ last_error: 'target changed externally' });
});

it('does not let a receipt for the old global directory clear work for a replacement directory', async () => {
  const f = await fixture();
  await f.run(); await f.receive('new directory baseline');
  const [old] = f.rows();
  await f.run('replacement');
  await expect(confirmFolderAttachmentCopy(f.db, 'profile', old as never)).rejects.toThrow('Backup folder changed');
  expect(f.inventory).toHaveBeenCalledTimes(2);
});
