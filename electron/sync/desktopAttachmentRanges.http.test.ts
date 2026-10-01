// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { publishAttachmentLibraryPathSnapshot,
  clearAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { seedGroup, writeAttachmentFixture } from './desktopAttachmentRanges.http.testSupport.js';
import { transferDesktopResources } from './desktopResourceTransfers.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { hashResourceFile } from './resourceAvailability.js';

const roots = vi.hoisted(() => ({ target: '' }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../attachments/resourceResolver.js', async (original) => ({
  ...await original<typeof import('../attachments/resourceResolver.js')>(),
  resolveAttachmentStoragePath: (hash: string) => path.join(roots.target, `${hash}.png`)
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: 'source',
  devices: [{ device_identity_key: 'source', state: 'active' },
    { device_identity_key: 'receiver', state: 'active' }]
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();


async function writeScaleEvidence(profile: Record<string, number | string>) {
  const mebibytes = Number(profile.bytes) / (1024 * 1024);
  const artifact = path.join(process.cwd(), `.tmp/artifacts/T267/desktop-${mebibytes}m-attachment-profile.json`);
  await fs.mkdir(path.dirname(artifact), { recursive: true });
  await fs.writeFile(artifact, JSON.stringify(profile, null, 2));
}

function injectRequestFailure(mode: 'disconnect' | 'elapsed' | 'expired') {
  const actualFetch = globalThis.fetch.bind(globalThis);
  const startedAt = Date.now();
  let now = startedAt;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const clock = { mockRestore: () => vi.useRealTimers() };
  const retriedNonces: string[] = [];
  let fail = true;
  let rangeRequests = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (mode === 'elapsed') { now += 30_000; vi.setSystemTime(now); }
    if (url.includes('/companion/attachment-resource')) rangeRequests += 1;
    if (fail && url.includes('offset=2097152')) {
      fail = false;
      if (mode !== 'expired') throw new Error('network disconnected');
      const response = await actualFetch(url, init);
      retriedNonces.push((await response.clone().json() as { nonce: string }).nonce);
      now += 60_001;
      vi.setSystemTime(now);
      return response;
    }
    const response = await actualFetch(url, init);
    if (mode === 'expired' && url.includes('offset=2097152')) {
      retriedNonces.push((await response.clone().json() as { nonce: string }).nonce);
    }
    return response;
  });
  return { clock, retriedNonces, elapsed: () => now - startedAt, requests: () => rangeRequests };
}

it.each(['disconnect', 'elapsed', 'expired'] as const)(
  'resumes a signed attachment transfer after %s without reusing expired ciphertext', async (mode) => {
  seedGroup();
  const sourceDir = resolveSyncPackPath('attachment-source');
  roots.target = resolveSyncPackPath('attachment-target');
  await fs.mkdir(sourceDir, { recursive: true });
  const bytes = Number(process.env.T267_ATTACHMENT_BYTES ?? 3 * 1024 * 1024);
  if (!Number.isSafeInteger(bytes) || bytes < 3 * 1024 * 1024) throw new Error('invalid_attachment_scale');
  const { hash, sourcePath } = await writeAttachmentFixture(sourceDir, bytes);
  const targetPath = path.join(roots.target, `${hash}.png`);
  publishAttachmentLibraryPathSnapshot({ assetsDir: sourceDir, libraryScope: 'test-source' });
  markDesktopSyncGroupMemberStateReady('receiver');
  const http = await startAuthenticatedSyncHttp();
  const peer = { endpoint_url: http.origin, endpointUrl: http.origin,
    group_id: 'group', local_device_id: 'receiver',
    peer_device_id: 'source', peer_device_name: 'Source', peer_platform: 'mac', deviceId: 'source' };
  const transfer = () => transferDesktopResources({ peer,
    needs: [{ kind: 'attachment', id: hash }], port: createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    blobs: new Map(), attachments: new Map([[hash, { attachmentId: hash,
      contentHash: hash, storageKey: `${hash}.png`, mimeType: 'image/png', sizeBytes: bytes }]]) });
  const fault = injectRequestFailure(mode);
  const startingRss = process.memoryUsage().rss;
  let peakRss = startingRss;
  const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100);
  try {
    expect((await transfer()).ready).toEqual([]);
    expect((await fs.stat(`${targetPath}.unverified`)).size).toBe(2 * 1024 * 1024);
    await expect(fs.stat(targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await transfer()).ready).toEqual([`attachment:${hash}`]);
    expect((await fs.stat(targetPath)).size).toBe(bytes);
    expect(await hashResourceFile(targetPath)).toBe(hash);
    await expect(fs.stat(`${targetPath}.unverified`)).rejects.toMatchObject({ code: 'ENOENT' });
    const offlineFetch = vi.fn(async () => { throw new Error('source offline after publication'); });
    vi.stubGlobal('fetch', offlineFetch);
    expect((await transfer()).ready).toEqual([`attachment:${hash}`]);
    expect(offlineFetch).not.toHaveBeenCalled();
    if (mode === 'elapsed') expect(fault.elapsed()).toBeGreaterThan(60_000);
    if (mode === 'expired') {
      expect(fault.retriedNonces).toHaveLength(2);
      expect(new Set(fault.retriedNonces).size).toBe(2);
    }
    if (process.env.T267_ATTACHMENT_BYTES) {
      await writeScaleEvidence({ bytes, hash, rangeRequests: fault.requests(), startingRss, peakRss,
        finalRss: process.memoryUsage().rss, sourcePath, targetPath });
    }
  } finally {
    clearInterval(sample);
    fault.clock.mockRestore();
    vi.unstubAllGlobals();
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness('receiver');
    clearAttachmentLibraryPathSnapshot();
  }
}, process.env.T267_ATTACHMENT_BYTES ? 600_000 : 30_000);
