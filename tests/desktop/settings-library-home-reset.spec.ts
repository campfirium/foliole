import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function loadLibraryPaths(desktopWindow: import('@playwright/test').Page) {
  return desktopWindow.evaluate(async () => {
    return globalThis.window?.electronAPI?.invoke('load_library_path_settings', {});
  });
}

async function updateLibraryHome(desktopWindow: import('@playwright/test').Page, nextPath: string | null) {
  return desktopWindow.evaluate(async (pathValue) => {
    return globalThis.window?.electronAPI?.invoke('update_library_path_setting', {
      location: 'library_home',
      path: pathValue
    });
  }, nextPath);
}

test('restores the desktop main folder to the real default library home', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const initialPaths = await loadLibraryPaths(desktopWindow);
  expect(typeof initialPaths?.library_home).toBe('string');

  const defaultLibraryHome = initialPaths.library_home as string;
  const customLibraryHome = path.join(testInfo.outputDir, 'CustomLibrary');
  expect(customLibraryHome).not.toBe(defaultLibraryHome);

  await expect(updateLibraryHome(desktopWindow, customLibraryHome)).resolves.toMatchObject({
    library_home: customLibraryHome
  });

  await expect(updateLibraryHome(desktopWindow, null)).resolves.toMatchObject({
    library_home: defaultLibraryHome
  });

  await desktopWindow.screenshot({
    path: testInfo.outputPath('settings-library-home-reset.png')
  });
});
