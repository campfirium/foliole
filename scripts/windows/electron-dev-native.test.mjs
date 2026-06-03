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
  expect(runner).toContain('process.env.FOLIOLE_WORKDIR ??= repoRoot');
  expect(runner).toContain("const mainLibraryHome = 'D:\\\\X\\\\U\\\\Foliole'");
  expect(runner).toContain("const sandboxLibraryHome = path.join(repoRoot, '.tmp', 'preview-sandbox-library');");
  expect(runner).toContain("process.env.FOLIOLE_NATIVE_PREVIEW_SANDBOX === '1'");
  expect(runner).toContain('resetSandboxState();');
  expect(runner).toContain('process.env.FOLIOLE_LIBRARY_HOME = localLibraryHome');
  expect(runner).toContain('process.env.FOLIOLE_GUIDED_SAMPLE_LOCALE = process.env.FOLIOLE_NATIVE_GUIDED_SAMPLE_LOCALE.trim();');
  expect(runner).not.toContain('library-path-settings.json');
  expect(runner).not.toContain('ensureLocalLibraryPathSettings();');
  expect(runner).toContain('assertLocalDatabaseWritable();');
  expect(runner).toContain("fs.openSync(databasePath, useTemporaryLibrary ? 'a+' : 'r+')");
  expect(runner).toContain("process.env.FOLIOLE_NATIVE_PREVIEW_TEMP_LIBRARY === '1'");
  expect(runner).toContain('native preview process cannot open the live database for write');
  expect(runner).not.toContain('if (!fs.existsSync(databasePath))');
  expect(runner).not.toContain('native-debug-library');
  expect(runner).not.toContain('FOLIOLE_USE_NATIVE_DEBUG_LIBRARY_COPY');
  expect(runner).not.toContain('copyDatabaseIfSourceIsNewer');
  expect(runner).not.toContain('debugLibraryHome');
  expect(runner).toContain("process.env.FOLIOLE_BOOT_SESSION ??= `windows-native-${randomUUID()}`");
  expect(runner).toContain("process.env.FOLIOLE_DISABLE_IN_APP_RELAUNCH ??= '1'");
  expect(runner).toContain('FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE');
  expect(runner).toContain("process.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION ??= '1'");
  expect(runner).toContain("process.env.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG ??= '1'");
  expect(runner).toContain("process.env.FOLIOLE_SKIP_STARTUP_INTEGRITY_CHECK ??= '1'");
  expect(runner).toContain("process.env.FOLIOLE_SKIP_STARTUP_NODE_SYNC_FLUSH ??= '1'");
  expect(runner).not.toContain('FOLIOLE_SKIP_STARTUP_SCHEMA_INIT');
  expect(runner).toContain("process.env.FOLIOLE_SKIP_STARTUP_WAL_ENABLE ??= '1'");
  expect(runner).toContain("process.env.FOLIOLE_SKIP_STARTUP_WINDOW_STATE ??= '1'");
  expect(runner).toContain("await import('../electron-dev.mjs');");
  expect(main).toContain("process.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION === '1'");
  expect(main).toContain("app.commandLine.appendSwitch('disable-gpu');");
  expect(main).toContain("app.commandLine.appendSwitch('disable-gpu-compositing');");
  expect(main).toContain("app.commandLine.appendSwitch('disable-gpu-sandbox');");
  expect(main).toContain('app.disableHardwareAcceleration();');
});
