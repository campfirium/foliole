// @vitest-environment node
import path from 'node:path';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';

import { it, vi } from 'vitest';

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
vi.mock('../../../electron/import/keepImportMonitor.js', () => ({ refreshKeepImportMonitorFromSettings: async () => {} }));

vi.stubGlobal('window', { setTimeout, clearTimeout });
await import('./companionBoundary.js');
const { runScenario, scenarioNames } = await import('./run.js');
const selected = process.env.FOLIOLE_SIM_SCENARIOS?.split(',') ?? scenarioNames;
const output = process.env.FOLIOLE_SIM_OUTPUT ?? path.resolve('.tmp/artifacts/sync-simulator', `test-${Date.now()}`);
for (const name of selected) it(`sync simulator: ${name}`, async () => {
  await runScenario(name, path.join(output, name));
}, name.startsWith('real') ? 1_200_000 : 600_000);
