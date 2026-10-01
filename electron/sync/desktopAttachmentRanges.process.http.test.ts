// @vitest-environment node
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { publishAttachmentLibraryPathSnapshot,
  clearAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { compileAttachmentHttpWorker } from './desktopAttachmentHttpProcess.testSupport.js';
import { seedGroup, writeAttachmentFixture } from './desktopAttachmentRanges.http.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { hashResourceFile } from './resourceAvailability.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
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


async function prepareSource(root: string, size: number | 'formal') {
  if (size !== 'formal') {
    const bytes = size * 1048576 + 17;
    return { bytes, mimeType: 'image/png', ...await writeAttachmentFixture(root, bytes) };
  }
  const fixture = path.resolve(process.env.T267_ATTACHMENT_FIXTURE!);
  if (!fixture.startsWith(path.resolve('.tmp/artifacts/T267') + path.sep)) {
    throw new Error('attachment_fixture_must_be_isolated');
  }
  const hash = await hashResourceFile(fixture);
  await fs.copyFile(fixture, path.join(root, `${hash}.epub`));
  return { bytes: (await fs.stat(fixture)).size, hash, mimeType: 'application/epub+zip' };
}

const sizes: Array<number | 'formal'> = process.env.T267_ATTACHMENT_FIXTURE ? ['formal'] : [3, 300];
it.each(sizes)('resumes authenticated HTTP in a new process after SIGKILL (fixture=%s)', async (mebibytes) => {
  seedGroup();
  const root = resolveSyncPackPath('http-worker');
  await fs.mkdir(root, { recursive: true });
  const { hash, bytes } = await prepareSource(root, mebibytes);
  const filePath = path.join(root, 'received.png');
  publishAttachmentLibraryPathSnapshot({ assetsDir: root, libraryScope: 'test-source' });
  markDesktopSyncGroupMemberStateReady('receiver');
  const http = await startAuthenticatedSyncHttp();
  try {
    const workerPath = await compileAttachmentHttpWorker(root);
    const args = [workerPath, http.origin, filePath, hash, String(bytes)];
    const run = promisify(execFile);
    const options = { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 120_000 };
    await expect(run(process.execPath, [...args, 'kill'], options)).rejects.toMatchObject({ signal: 'SIGKILL' });
    const checkpointDb = new Database(filePath + '.db');
    expect(checkpointDb.prepare('SELECT confirmed_bytes FROM attachment_receive_checkpoints').get())
      .toEqual({ confirmed_bytes: 2097152 });
    checkpointDb.close();
    expect((await fs.stat(filePath + '.unverified')).size).toBe(2097152);
    const resumed = JSON.parse((await run(process.execPath, [...args, 'resume'], options)).stdout);
    expect(resumed.offsets).toEqual([0, ...Array.from({ length: Math.ceil(bytes / 1048576) - 2 },
      (_, i) => (i + 2) * 1048576)]);
    expect(resumed.checkpoints).toBe(0);
    expect(await hashResourceFile(filePath)).toBe(hash);
    const replay = JSON.parse((await run(process.execPath, [...args, 'resume'], options)).stdout);
    expect(replay.offsets).toEqual([]);
    await fs.mkdir('.tmp/artifacts/T267', { recursive: true });
    await fs.writeFile(`.tmp/artifacts/T267/authenticated-process-${mebibytes}m.json`,
      JSON.stringify({ bytes, hash, ...resumed }, null, 2));
  } finally {
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness('receiver');
    clearAttachmentLibraryPathSnapshot();
  }
}, 150_000);

it('completes a real slow HTTP transfer lasting more than sixty seconds', async () => {
  seedGroup();
  const root = resolveSyncPackPath('slow-http');
  await fs.mkdir(root, { recursive: true });
  const bytes = 3 * 1048576 + 17;
  const { hash } = await writeAttachmentFixture(root, bytes);
  const filePath = path.join(root, 'received.png');
  publishAttachmentLibraryPathSnapshot({ assetsDir: root, libraryScope: 'test-source' });
  markDesktopSyncGroupMemberStateReady('receiver');
  const http = await startAuthenticatedSyncHttp({ attachmentDelayMs: 17_000 });
  try {
    const worker = await compileAttachmentHttpWorker(root);
    const started = Date.now();
    const result = await promisify(execFile)(process.execPath,
      [worker, http.origin, filePath, hash, String(bytes), 'resume'],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 120_000 });
    const elapsedMs = Date.now() - started;
    const profile = JSON.parse(result.stdout);
    expect(elapsedMs).toBeGreaterThan(60_000);
    expect(profile.offsets).toEqual([0, 1048576, 2097152, 3145728]);
    expect(profile.checkpoints).toBe(0);
    expect(await hashResourceFile(filePath)).toBe(hash);
    await fs.mkdir('.tmp/artifacts/T267', { recursive: true });
    await fs.writeFile('.tmp/artifacts/T267/authenticated-process-slow.json',
      JSON.stringify({ bytes, hash, elapsedMs, ...profile }, null, 2));
  } finally {
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness('receiver');
    clearAttachmentLibraryPathSnapshot();
  }
}, 150_000);
