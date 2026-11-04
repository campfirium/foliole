// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { textBranch } from '../../../../../electron/database/topicTextState.testSupport.js';
import { createFolderWriterFixture } from '../../../../../lib/core/sync/folderSync/writeRound.testSupport.js';
import { applyConvergentSyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeConvergence.js';

import { createFolderSyncService } from './folderSyncService.js';
import { folderNativeFixture } from './folderSyncService.testSupport.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture() {
  const f = await createFolderWriterFixture();
  cleanups.push(f.close);
  const native = folderNativeFixture(f.root);
  let current = true;
  const open = async () => ({ sourceId: 'source', source: f.host, attachments: f.input.sourceAttachments,
    assertCurrent() { if (!current) throw new Error('library_changed'); } });
  const service = createFolderSyncService(native.plugin, open);
  return { ...f, native, service, reopen: () => createFolderSyncService(native.plugin, open),
    changeLibrary: () => { current = false; } };
}

it('selects once, copies actual facts and resources through the native contract, and retains location and completion after reopening', async () => {
  const f = await fixture();
  const resources = await f.resources();
  expect((await f.service.read()).location).toBeNull();
  await f.service.choose();
  const written = await f.service.write();
  expect(written).toMatchObject({ changed: true, transferredResources: 2, pendingResources: [] });
  expect(await fs.readFile(path.join(f.root, 'destination/attachments', resources.imageKey))).toEqual(resources.image);
  const reopened = f.reopen();
  expect((await reopened.read()).location).toMatchObject({ token: 'tree-token', name: 'Documents',
    completion: { sourceId: 'source', generation: 1, pendingResources: 0 } });
  expect(await reopened.write()).toMatchObject({ changed: false, protocolBytesWritten: 0, transferredResources: 0 });
  expect(f.native.hasLease()).toBe(false);
});

it('keeps the selected folder and completed result when the picker is cancelled', async () => {
  const f = await fixture();
  await f.service.choose();
  await f.service.write();
  const before = await f.service.read();
  f.native.cancel();
  expect(await f.service.choose()).toMatchObject({ cancelled: true });
  expect(await f.service.read()).toEqual(before);
});

it('rejects revoked permission, and retries after access returns without losing the previous result', async () => {
  const f = await fixture();
  await f.service.choose();
  await f.service.write();
  const before = (await f.service.read()).location!.completion;
  await applyConvergentSyncNodesWithDbPort(f.db, [textBranch('v2', 'New body', f.first)]);
  f.native.revoke();
  await expect(f.service.write()).rejects.toThrow('folder_sync_authorization_required');
  expect((await f.service.read()).location!.completion).toEqual(before);
  f.native.grant();
  expect(await f.service.write()).toMatchObject({ changed: true, changedObjects: 1 });
});

it('leaves completion unchanged on target failure, releases ownership, then retries the same changes', async () => {
  const f = await fixture();
  await f.service.choose();
  await f.service.write();
  const before = (await f.service.read()).location!.completion;
  await applyConvergentSyncNodesWithDbPort(f.db, [textBranch('v2', 'New body', f.first)]);
  f.native.fail(true);
  await expect(f.service.write()).rejects.toThrow('space_unavailable');
  expect((await f.service.read()).location!.completion).toEqual(before);
  expect(f.native.hasLease()).toBe(false);
  f.native.fail(false);
  expect(await f.service.write()).toMatchObject({ changed: true, generation: 2 });
});

it('does not save completion for a library which ceased being current while acquiring its folder', async () => {
  const f = await fixture();
  await f.service.choose();
  const acquire = f.native.plugin.acquire;
  f.native.plugin.acquire = async input => { const result = await acquire(input); f.changeLibrary(); return result; };
  await expect(f.service.write()).rejects.toThrow('library_changed');
  expect((await f.service.read()).location!.completion).toBeNull();
  expect(f.native.hasLease()).toBe(false);
});

it('retains the existing attachment pending semantics and prevents a second service from owning an active target', async () => {
  const f = await fixture();
  await f.resources(false);
  await f.service.choose();
  expect(await f.service.write()).toMatchObject({ databaseComplete: true, transferredResources: 0 });
  expect((await f.service.read()).location!.completion).toMatchObject({ pendingResources: 2 });
  const lease = await f.native.plugin.acquire({ token: 'tree-token' });
  await expect(f.reopen().write()).rejects.toThrow('folder_sync_busy');
  await f.native.plugin.release({ token: 'tree-token', ...lease });
  expect(await f.service.write()).toMatchObject({ changed: false });
});
