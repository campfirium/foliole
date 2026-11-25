import fs from 'node:fs/promises';

import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';

test('finds file access in General and opens an external file after retrying', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  const filePath = testInfo.outputPath('settings-local-file.md');
  await fs.mkdir(testInfo.outputDir, { recursive: true });
  await fs.writeFile(filePath, '# Settings file access fixture\n');
  await desktopApp.evaluate(({ dialog }, selectedPath) => {
    const selections = [[], [`${selectedPath}.pdf`], [selectedPath]];
    dialog.showOpenDialog = async () => {
      const filePaths = selections.shift() ?? [];
      return { canceled: filePaths.length === 0, filePaths };
    };
  }, filePath);

  const settings = await openSettingsCategory(desktopWindow, 'General');
  const section = settings.getByRole('region', { name: /^(Open external Markdown|打开外部 Markdown)$/ });
  await expect(section.getByText(/^(File access|文件访问权限)$/)).toBeVisible();
  const screenshot = testInfo.outputPath('file-access-settings.png');
  await section.screenshot({ path: screenshot });
  await testInfo.attach('file-access-settings', { path: screenshot });

  const open = section.getByRole('button', { name: /^(Open File|打开文件)…$/ });
  await open.click();
  await expect(open).toBeEnabled();
  await expect(section.getByRole('alert')).toHaveCount(0);
  await open.click();
  await expect(section.getByRole('alert')).toBeVisible();
  await open.click();
  await expect(settings).toBeHidden();
  await expect(desktopWindow.locator('.markdown-editor-host .cm-content').first())
    .toContainText('Settings file access fixture');
});
