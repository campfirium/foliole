// @vitest-environment node
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { promises as fs } from 'node:fs';
import { setTimeout, clearTimeout } from 'node:timers';

import { expect, it, vi } from 'vitest';

// Adapt application singleton ownership and OS bootstrapping only. All sync, SQL,
// signature/nonce, crypto, HTTP and resource implementations remain production code.
vi.mock('../../../electron/database/connection.js', async () => {
  const { currentPeer } = await import('./scope.js');
  const { getSqliteConnectionCoordinator } = await import('../../../electron/database/sqliteConnectionCoordinator.js');
  return { openDatabaseConnection: currentPeer, resolveDatabasePath: () => currentPeer().dbPath,
    registerDatabaseConnectionCleanup: () => {},
    runWithDatabaseConnectionOwner(task) {
      return getSqliteConnectionCoordinator(currentPeer().sqlite).runExclusive(task);
    } };
});
vi.mock('../../../electron/database/hostProfile.js', async (original) => {
  const actual = await original();
  const { currentPeer } = await import('./scope.js');
  return { ...actual, loadOrCreateDesktopHostName: () => currentPeer().name };
});
vi.mock('../../../electron/attachments/attachmentLibraryPathSnapshot.js', async (original) => {
  const actual = await original();
  const { currentPeer } = await import('./scope.js');
  return { ...actual, readAttachmentLibraryPathSnapshot: () => ({ assetsDir: currentPeer().assets,
    libraryScope: currentPeer().id }) };
});
vi.mock('../../../electron/ipc/paths.js', async () => {
  const { currentPeer } = await import('./scope.js');
  return { resolveAppPaths: () => ({ app_data_dir: currentPeer().root,
    app_cache_dir: currentPeer().root + '/cache', app_config_dir: currentPeer().root + '/config',
    app_log_dir: currentPeer().root + '/logs' }) };
});
vi.mock('../../../electron/ipc/libraryPaths.js', async () => {
  const { currentPeer } = await import('./scope.js');
  return { loadLibraryPathSettingsSync: () => ({ library_home: currentPeer().root,
    assets_dir: currentPeer().assets, data_dir: currentPeer().root, database_path: currentPeer().dbPath }) };
});
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => { throw new Error('simulator_os_path_forbidden'); }, isPackaged: false },
  ipcMain: { handle: () => {}, on: () => {} }, nativeImage: {} }));
// Background UI/import cadence is outside the local data plane. Never launch watchers.
vi.mock('../../../electron/import/keepImportMonitor.js', () => ({ refreshKeepImportMonitorFromSettings: async () => {} }));

vi.stubGlobal('window', { setTimeout, clearTimeout });

const { importImageAttachmentResource } = await import('../../../electron/attachments/importImageAttachmentResource.js');
const { assertBody, assertCompleted, assertHealthy, assertResources, graph, state } = await import('./assertions.js');
const { edit } = await import('./operations.js');
const { openPeer, pairPeers, reopenPeer } = await import('./peers.js');
const { inPeer } = await import('./scope.js');
const { pull, serve } = await import('./transport.js');

async function seedResource(source) {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLs8AAAAASUVORK5CYII=', 'base64');
  const imported = await inPeer(source, () => importImageAttachmentResource({ bytes,
    mimeType: 'image/png', originalName: 'resume.png', errorSource: 'resource-resume-test' }));
  expect(imported.status).toBe('imported');
  const body = `![image](asset://${imported.storage_key})`;
  edit(source, body);
  return body;
}

for (const restart of [false, true]) it(`resumes interrupted images without an edit, restart=${restart}`, async () => {
  process.env.FOLIOLE_SIM_PATH = 'desktop';
  process.env.FOLIOLE_SIM_SCENARIO = 'resource-resume';
  const parent = path.resolve('.tmp/artifacts/s275', `run-${randomUUID()}`);
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'resume-'));
  const source = openPeer(root, 'a', '1');
  const target = openPeer(root, 'b', '1');
  pairPeers([source, target]);
  let endpoint = await serve(source);
  try {
    const body = await seedResource(source);
    const sourceBefore = graph(source);
    endpoint.interrupt = { path: '/companion/attachment-resource', remaining: 1 };
    await expect(pull(endpoint, target)).rejects.toThrow();
    expect(endpoint.interrupt).toBeNull();
    assertBody(target, body);
    const before = state(target);
    expect(before.resourceArticles).toHaveLength(1);
    expect(before.progress).toHaveLength(1);
    expect(before.progress[0]).toMatchObject({ completed: 1 });
    const targetBefore = graph(target);
    if (restart) {
      await endpoint.close();
      reopenPeer(source);
      reopenPeer(target);
      expect(state(target)).toEqual(before);
      endpoint = await serve(source);
    }
    await pull(endpoint, target);
    expect(graph(source)).toEqual(sourceBefore);
    expect(graph(target)).toEqual(targetBefore);
    assertBody(target, body);
    await assertResources(source, target);
    await assertCompleted(target);
    expect(state(target).resourceArticles).toEqual([]);
    const requestsBeforeReplay = endpoint.requests.length;
    await pull(endpoint, target);
    expect(endpoint.requests.slice(requestsBeforeReplay).filter((url) =>
      url.startsWith('/companion/attachment-resource'))).toEqual([]);
    expect(graph(target)).toEqual(targetBefore);
    assertHealthy(source);
    assertHealthy(target);
    await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify({ restart,
      before, final: state(target), requests: endpoint.requests }, null, 2));
  } finally {
    await endpoint.close();
    source.sqlite.close();
    target.sqlite.close();
  }
}, 60_000);
