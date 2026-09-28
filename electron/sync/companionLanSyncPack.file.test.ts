// @vitest-environment node

import { promises as fs } from 'node:fs';

import { expect, it, vi } from 'vitest';

const buildMock = vi.hoisted(() => vi.fn(async (args: { outputPath: string }) => {
  const { promises: files } = await import('node:fs');
  await files.writeFile(args.outputPath, Buffer.alloc(64 * 1024, 7));
}));

vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({
    group_id: 'group', local_device_identity_key: 'source',
    devices: [{ device_identity_key: 'source', state: 'active' }]
  })
}));
vi.mock('../database/syncPackBuilder.js', () => ({ buildDesktopSyncPackPage: buildMock }));
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: vi.fn() }));
vi.mock('../database/syncGroupRestoreState.js', () => ({ loadDesktopSyncGroupRestoreState: vi.fn() }));

import { buildCompanionSyncPackResource } from './companionLanSyncPack.js';

it('returns a disposable file instead of materializing the structure pack body', async () => {
  const resource = await buildCompanionSyncPackResource(
    new URL('http://localhost/companion/sync-pack?after_state_seq=0&page_contract=bounded-v1'), 'target'
  );
  expect(resource.status).toBe('ready');
  expect(resource).not.toHaveProperty('body');
  expect(resource.filePath).toBeTruthy();
  expect((await fs.stat(resource.filePath!)).size).toBe(64 * 1024);
  expect(buildMock).toHaveBeenCalledWith(expect.objectContaining({
    fromPeerId: 'source', fromStateSeq: 0, toPeerId: 'target'
  }), expect.objectContaining({ applyRows: 128, databaseBytes: 4 * 1024 * 1024,
    transferBytes: 1024 * 1024 }));
  await resource.cleanup!();
  await expect(fs.stat(resource.filePath!)).rejects.toThrow();
});

it('keeps a follow-up page on the requested frontier and source epoch', async () => {
  const resource = await buildCompanionSyncPackResource(new URL(
    'http://localhost/companion/sync-pack?after_state_seq=3&page_contract=bounded-v1&frontier_state_seq=8&source_epoch=epoch-a'
  ), 'target');
  expect(resource.status).toBe('ready');
  expect(buildMock).toHaveBeenCalledWith(expect.objectContaining({
    fromStateSeq: 3, frontierStateSeq: 8, sourceEpoch: 'epoch-a'
  }), expect.any(Object));
  await resource.cleanup!();
});

it('rejects an invalid page boundary before building a pack', async () => {
  buildMock.mockClear();
  const resource = await buildCompanionSyncPackResource(new URL(
    'http://localhost/companion/sync-pack?after_state_seq=4&page_contract=bounded-v1&frontier_state_seq=3'
  ), 'target');
  expect(resource).toMatchObject({ status: 'error', statusCode: 400 });
  expect(buildMock).not.toHaveBeenCalled();
});

it('refuses a legacy client before returning a partial page', async () => {
  buildMock.mockClear();
  const resource = await buildCompanionSyncPackResource(
    new URL('http://localhost/companion/sync-pack?after_state_seq=0'), 'target'
  );
  expect(resource).toMatchObject({ error: 'sync_pack_page_contract_required',
    status: 'error', statusCode: 409 });
  expect(buildMock).not.toHaveBeenCalled();
});
