import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');

test('persists one API import tag and exposes no manual import controls', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  // SKIP: acceptance is limited to macOS Hidden Native | 2026-09-12 | revive: the plan requires another host or visible native acceptance
  test.skip(
    process.platform !== 'darwin' || process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN !== '1',
    'T178-22 acceptance is macOS Hidden Native only.'
  );
  const isolation = await desktopApp.evaluate(() => ({
    hidden: process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN,
    libraryHome: process.env.FOLIOLE_LIBRARY_HOME,
    stateRoot: process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT
  }));
  expect(isolation.hidden).toBe('1');
  expect(isolation.libraryHome).toBe(path.join(isolation.stateRoot!, 'library'));

  await desktopWindow.evaluate(async () => {
    const settings = await globalThis.window?.electronAPI?.invoke('load_import_manager_settings');
    await globalThis.window?.electronAPI?.invoke('save_import_manager_settings', {
      settings: { ...settings, readwiseSourceMode: 'api' }
    });
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const dialog = await openSettingsCategory(desktopWindow, 'ReadwiseReader');
  const importTag = dialog.getByRole('textbox', {
    name: /^(Reader document import tag|Reader 文档导入标签)$/
  });
  await expect(importTag).toHaveValue('');
  await importTag.fill('favorite');
  await expect.poll(() => desktopWindow.evaluate(async () => (
    await globalThis.window?.electronAPI?.invoke('load_import_manager_settings')
  )?.readwiseAutoImportPolicy?.importTag)).toBe('favorite');
  await expect(dialog.getByText(/^(Manual import|手动导入)$/)).toHaveCount(0);
  await expect(dialog.getByRole('searchbox', {
    name: /^(Search by title or author|按标题或作者搜索)$/
  })).toHaveCount(0);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  const screenshot = path.join(ARTIFACT_DIR, 't178-22-readwise-import-tag-darwin.png');
  await dialog.screenshot({ path: screenshot });
  await testInfo.attach('t178-22-readwise-import-tag', { contentType: 'image/png', path: screenshot });
});
