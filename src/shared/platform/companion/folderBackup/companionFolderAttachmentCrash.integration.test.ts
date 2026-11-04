// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { completeFolderAttachmentCopy } from '../../../../../lib/core/database/companionFolderAttachmentWork';
import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';

import { attachmentDigest, folderAttachmentWorkFixture } from './companionFolderAttachmentWork.testSupport';
import { consumeCompanionFolderAttachmentWork } from './consumeCompanionFolderAttachmentWork';

const native = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { accessFramedSyncFile: native.access } }));
const fixtures: Awaited<ReturnType<typeof folderAttachmentWorkFixture>>[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.close(); });

it.each(['before-source', 'after-source', 'after-ready', 'after-target', 'after-confirm'])(
  'recovers committed production work after a real process kill at %s', async boundary => {
    const f = await folderAttachmentWorkFixture(native, createBetterSqliteDbPort);
    fixtures.push(f);
    await f.run();
    const text = 'a process interrupted while storing an immutable original';
    const bytes = Buffer.from(text), key = `${attachmentDigest(bytes)}.png`;
    f.suspend();
    const child = spawnSync(process.execPath, ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs',
      '--experimental-strip-types', 'scripts/build/fixtures/attachments/folder-work-crash.ts',
      f.root, boundary, key, bytes.toString('base64')], {
      cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 15000
    });
    expect(child.signal, child.stderr).toBe('SIGKILL');
    await f.reopen();
    if (boundary === 'before-source') {
      expect((await f.run()).attachmentFilesPending).toBe(1);
      expect(await f.exists(path.join(f.target, key))).toBe(false);
      // The original receiver retries on the same persisted source intent, not a reconstructed fixture.
      await f.receive(text);
    }
    expect(f.rows()).toHaveLength(boundary === 'after-confirm' ? 0 : 1);
    await f.run();
    expect(await readFile(path.join(f.target, key))).toEqual(bytes);
    expect(f.rows()).toEqual([]);
    expect(f.inventory).toHaveBeenCalledTimes(1);
  }, 25000);

it.each(['before-source', 'after-source', 'after-ready', 'after-target', 'after-confirm'])(
  'recovers a genuine deletion after process death at %s', async boundary => {
    const f = await folderAttachmentWorkFixture(native, createBetterSqliteDbPort); fixtures.push(f);
    await f.run(); const item = await f.receive('retired original'); await f.run(); f.suspend();
    const child = spawnSync(process.execPath, ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs',
      '--experimental-strip-types', 'scripts/build/fixtures/attachments/folder-work-crash.ts',
      f.root, `delete-${boundary}`, item.key, item.bytes.toString('base64')], {
      cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 15000
    });
    expect(child.signal, child.stderr).toBe('SIGKILL'); await f.reopen();
    const remove = vi.fn(async () => {
      if (await f.exists(item.source)) throw new Error('source still exists');
      await rm(item.file, { force: true });
    });
    const run = () => consumeCompanionFolderAttachmentWork({ ...f.port, deleteAttachment: remove } as unknown as CompanionFolderBackupPort,
      { write: f.host.write, inventory: f.inventory }, { profile: 'profile', requestId: 'committed', sourceEpoch: 'owner',
        deletions: f.rows() as never[] });
    if (boundary === 'before-source') {
      expect((await run()).attachmentFilesPending).toBe(1); expect(await f.exists(item.file)).toBe(true);
      await rm(item.source); await f.db.transaction(tx => completeFolderAttachmentCopy(tx, item.key));
    }
    await f.sqlite.backup(path.join(f.root, 'Foliole.sqlite'));
    expect((await run()).attachmentFilesPending).toBe(0);
    expect(await f.exists(item.file)).toBe(false); expect(f.rows()).toEqual([]);
  }, 25000);
