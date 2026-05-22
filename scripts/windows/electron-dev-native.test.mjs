// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { expect, it } from 'vitest';

it('keeps the proven Electron dev runner while scoping native user data', async () => {
  const runner = await readFile(path.resolve(process.cwd(), 'scripts/windows/electron-dev-native.mjs'), 'utf8');
  const main = await readFile(path.resolve(process.cwd(), 'electron/main.ts'), 'utf8');

  expect(runner).toContain('process.env.FOLIOLE_USER_DATA_PATH = userDataPath');
  expect(runner).toContain('process.env.FOLIOLE_SESSION_DATA_PATH = userDataPath');
  expect(runner).toContain("const localLibraryHome = 'D:\\\\X\\\\U\\\\Foliole'");
  expect(runner).toContain("const debugLibraryHome = path.join(userDataPath, 'native-debug-library')");
  expect(runner).toContain("process.env.FOLIOLE_USE_NATIVE_DEBUG_LIBRARY_COPY === '1'");
  expect(runner).toContain('copyDatabaseIfSourceIsNewer(sourceDatabasePath, targetDatabasePath)');
  expect(runner).toContain('removeTargetSqliteSidecars(targetPath);');
  expect(runner).toContain("for (const suffix of ['-shm', '-wal'])");
  expect(runner).toContain('sidecarRemoveRetryMs');
  expect(runner).toContain("['EACCES', 'EBUSY', 'EPERM']");
  expect(runner).toContain('skipped debug database refresh because sidecar is locked');
  expect(runner).toContain('if (fs.existsSync(targetPath) && isSidecarLocked(error))');
  expect(runner).toContain('resolveLibraryHome()');
  expect(runner).toContain('library-path-settings.json');
  expect(runner).toContain('ensureLocalLibraryPathSettings(resolveLibraryHome());');
  expect(runner).toContain("process.env.FOLIOLE_BOOT_SESSION ??= `windows-native-${randomUUID()}`");
  expect(runner).toContain("process.env.FOLIOLE_DISABLE_IN_APP_RELAUNCH ??= '1'");
  expect(runner).toContain('FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE');
  expect(runner).toContain("process.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION ??= '1'");
  expect(runner).toContain("process.env.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG ??= '1'");
  expect(runner).toContain("process.env.FOLIOLE_SKIP_STARTUP_INTEGRITY_CHECK ??= '1'");
  expect(runner).toContain("process.env.FOLIOLE_SKIP_STARTUP_NODE_SYNC_FLUSH ??= '1'");
  expect(runner).toContain("process.env.FOLIOLE_SKIP_STARTUP_SCHEMA_INIT ??= '1'");
  expect(runner).toContain("process.env.FOLIOLE_SKIP_STARTUP_WAL_ENABLE ??= '1'");
  expect(runner).toContain("process.env.FOLIOLE_SKIP_STARTUP_WINDOW_STATE ??= '1'");
  expect(runner).toContain("await import('../electron-dev.mjs');");
  expect(main).toContain("process.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION === '1'");
  expect(main).toContain("app.commandLine.appendSwitch('disable-gpu');");
  expect(main).toContain("app.commandLine.appendSwitch('disable-gpu-compositing');");
  expect(main).toContain("app.commandLine.appendSwitch('disable-gpu-sandbox');");
  expect(main).toContain('app.disableHardwareAcceleration();');
});
