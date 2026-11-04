// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { textBranch } from '../../../../electron/database/topicTextState.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../../../electron/sync/desktopFramedSyncFiles.js';
import { applyConvergentSyncNodesWithDbPort } from '../syncNodeConvergence.js';

import { folderSyncCheckpointKey, loadFolderSyncCheckpoint, readFolderSyncInventory } from './checkpoint.js';
import { writeFolderSyncRound, type FolderSyncWriteTarget } from './writeRound.js';
import { checkpointPayloadCases, createFolderWriterFixture } from './writeRound.testSupport.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function fixture() {
  const f = await createFolderWriterFixture();
  cleanups.push(f.close);
  return f;
}

it('writes existing protocol streams and both inline and explicit resources, then does no unchanged writes', async () => {
  const f = await fixture();
  const resources = await f.resources();
  const first = await f.run();
  expect(first).toMatchObject({ changed: true, databaseComplete: true, transferredResources: 2, pendingResources: [] });
  expect(await fs.readFile(path.join(f.targetAssets, resources.imageKey))).toEqual(resources.image);
  expect(await fs.readFile(path.join(f.targetAssets, resources.pdfKey))).toEqual(resources.pdf);
  const checkpoint = (await f.checkpoint())!;
  expect(await checkpointPayloadCases(f, checkpoint)).toContain('request_object_end');
  expect(await checkpointPayloadCases(f, checkpoint)).toContain('blob_chunk');
  expect(await f.run()).toMatchObject({ changed: false, changedObjects: 0, transferredResources: 0, protocolBytesWritten: 0 });
  expect((await f.checkpoint())!.generation).toBe(checkpoint.generation);
});

it('commits database facts independently from unavailable resources and later copies resources without source edits', async () => {
  const f = await fixture();
  const resources = await f.resources(false);
  const first = await f.run();
  expect(first).toMatchObject({ databaseComplete: true, transferredResources: 0 });
  expect(first.pendingResources).toEqual([resources.imageKey, resources.pdfKey].sort());
  expect(await f.run()).toMatchObject({ changed: false, databaseComplete: true, pendingResources: first.pendingResources });
  await fs.writeFile(path.join(f.sourceAssets, resources.imageKey), resources.image);
  await fs.writeFile(path.join(f.sourceAssets, resources.pdfKey), resources.pdf);
  expect(await f.run()).toMatchObject({ changed: true, changedObjects: 0, transferredResources: 2, pendingResources: [] });
  expect((await f.checkpoint())!.pendingResources).toEqual([]);
});

it.each(['truncated', 'trailing-bytes'] as const)('preserves the previous slot after an actual %s checkpoint write', async fault => {
  const f = await fixture();
  await f.run();
  const before = (await f.checkpoint())!;
  await applyConvergentSyncNodesWithDbPort(f.db, [textBranch('v2', 'Changed article', f.first)]);
  const original = f.input.target.files;
  f.input.target.files = { ...original, async write(key, bytes) {
    if (key === folderSyncCheckpointKey(0)) {
      const damaged = fault === 'truncated' ? bytes.subarray(0, Math.floor(bytes.length / 2))
        : Buffer.concat([bytes, Buffer.from('untruncated old tail')]);
      await fs.writeFile(path.join(f.targetRoot, key), damaged);
    } else await original.write(key, bytes);
  } };
  await expect(f.run()).rejects.toThrow('folder_sync_checkpoint_write_incomplete');
  expect((await f.checkpoint())!.generation).toBe(before.generation);
  f.input.target.files = original;
  expect(await f.run()).toMatchObject({ changed: true, generation: before.generation + 1 });
  expect(await f.run()).toMatchObject({ changed: false });
});

it('uses the completed target index after reopening instead of relying on local completion state', async () => {
  const f = await fixture();
  await f.run();
  const files = createDesktopFramedSyncFiles(f.targetRoot);
  const result = await writeFolderSyncRound({ ...f.input, target: { ...f.input.target, files } });
  expect(result).toMatchObject({ changed: false, protocolBytesWritten: 0, generation: 1 });
  expect((await loadFolderSyncCheckpoint(files, f.input.sourceId))!.generation).toBe(1);
});

it('binds a run to its original source and target before publishing or returning completion', async () => {
  const f = await fixture();
  await f.run();
  await applyConvergentSyncNodesWithDbPort(f.db, [textBranch('v2', 'Changed article', f.first)]);
  const original = f.input.target.files;
  let current = true;
  const result = writeFolderSyncRound({ ...f.input, assertCurrent() {
    if (!current) throw new Error('target_or_library_changed');
  }, target: { ...f.input.target, files: { ...original, async write(key, bytes) {
    await original.write(key, bytes);
    if (key.startsWith('folder-sync/objects/')) current = false;
  } } } });
  await expect(result).rejects.toThrow('target_or_library_changed');
  expect((await f.checkpoint())!.generation).toBe(1);
  expect(f.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('topic')).toBe('Changed article');
});

it('keeps changes made during destination I/O for the following source snapshot', async () => {
  const f = await fixture();
  const original = f.input.target.files;
  let edited = false;
  f.input.target.files = { ...original, async write(key, bytes) {
    await original.write(key, bytes);
    if (!edited && key.startsWith('folder-sync/objects/')) {
      edited = true;
      await applyConvergentSyncNodesWithDbPort(f.db, [textBranch('v2', 'Edited during target I/O', f.first)]);
    }
  } };
  await f.run();
  expect((await readFolderSyncInventory(original, (await f.checkpoint())!))[0]!.currentVersionId).toBe('v1');
  expect(await f.run()).toMatchObject({ changed: true, changedObjects: 1 });
  expect((await readFolderSyncInventory(original, (await f.checkpoint())!))[0]!.currentVersionId).toBe('v2');
});

it('refuses another source library and damaged protocol data rather than claiming it is up to date', async () => {
  const f = await fixture();
  await f.run();
  await expect(writeFolderSyncRound({ ...f.input, sourceId: 'another-source' })).rejects.toThrow('folder_sync_different_source');
  const frame = (await f.checkpoint())!.objects[0]!.frames[0]!;
  await fs.writeFile(path.join(f.targetRoot, frame.key), 'damaged');
  await expect(f.run()).rejects.toThrow('folder_sync_object_corrupt');
});

it('finds a completed publication after interruption before the caller receives completion', async () => {
  const f = await fixture();
  await f.run();
  await applyConvergentSyncNodesWithDbPort(f.db, [textBranch('v2', 'Changed article', f.first)]);
  const original = f.input.target.files;
  let current = true;
  await expect(writeFolderSyncRound({ ...f.input, assertCurrent() {
    if (!current) throw new Error('interrupted_before_local_state');
  }, target: { ...f.input.target, files: { ...original, async write(key, bytes) {
    await original.write(key, bytes);
    if (key === folderSyncCheckpointKey(0)) current = false;
  } } } })).rejects.toThrow('interrupted_before_local_state');
  expect((await f.checkpoint())!.generation).toBe(2);
  expect(await f.run()).toMatchObject({ changed: false, generation: 2, protocolBytesWritten: 0 });
});

it('serializes independent writer instances using the same target owner', async () => {
  const f = await fixture();
  const other = { ...f.input, target: { ...f.input.target, files: createDesktopFramedSyncFiles(f.targetRoot) } };
  const results = await Promise.all([f.run(), writeFolderSyncRound(other)]);
  expect(results.map(result => result.changed)).toEqual([true, false]);
  expect((await f.checkpoint())!.generation).toBe(1);
});

it('continues existing block transfer progress after a resource window fails', async () => {
  const f = await fixture();
  const resource = await f.resources(true, 1024 * 1024 + 37);
  const original = f.input.target.attachments;
  let interrupt = true;
  const target: FolderSyncWriteTarget = { ...f.input.target, attachments: { ...original, async receive(item, offset, bytes) {
    if (interrupt && item.storageKey === resource.imageKey && offset > 0) throw new Error('interrupted_attachment');
    return original.receive(item, offset, bytes);
  } } };
  const partial = await writeFolderSyncRound({ ...f.input, target });
  expect(partial.pendingResources).toEqual([resource.imageKey]);
  interrupt = false;
  const completed = await writeFolderSyncRound({ ...f.input, target });
  expect(completed).toMatchObject({ changedObjects: 0, transferredResources: 1, pendingResources: [] });
  expect(await fs.readFile(path.join(f.targetAssets, resource.imageKey))).toEqual(resource.image);
});

it('checks existing resource bytes instead of accepting a remembered successful transfer', async () => {
  const f = await fixture();
  const resource = await f.resources();
  await f.run();
  await fs.writeFile(path.join(f.targetAssets, resource.imageKey), Buffer.alloc(resource.image.length, 91));
  const result = await f.run();
  expect(result.databaseComplete).toBe(true);
  expect(result.transferredResources > 0 || result.pendingResources.includes(resource.imageKey)).toBe(true);
  if (!result.pendingResources.includes(resource.imageKey)) {
    expect(await fs.readFile(path.join(f.targetAssets, resource.imageKey))).toEqual(resource.image);
  }
  expect(await fs.readFile(path.join(f.sourceAssets, resource.imageKey))).toEqual(resource.image);
});
