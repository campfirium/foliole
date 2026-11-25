import fs from 'node:fs/promises';

import { expect, test } from './harness/fixtures';

test('opens and saves an external Markdown file from the left toolbar', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  const filePath = testInfo.outputPath('toolbar-open-file.md');
  await fs.mkdir(testInfo.outputDir, { recursive: true });
  await fs.writeFile(filePath, '# Toolbar fixture\nOriginal Markdown content\n');
  await desktopApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, filePath);

  const toolbar = desktopWindow.getByRole('region', { name: /^(Left toolbar|左侧工具栏)$/i });
  const openFile = toolbar.getByRole('button', { name: /^(Open External Document|打开外部文档)$/ });
  await expect(openFile).toBeVisible();
  await openFile.click();

  const editor = desktopWindow.locator('.markdown-editor-host .cm-content').first();
  await expect(editor).toContainText('Original Markdown content');
  await editor.click();
  await desktopWindow.keyboard.insertText('Saved to source ');
  await desktopWindow.keyboard.press('Control+S');
  await expect.poll(() => fs.readFile(filePath, 'utf8')).toContain('Saved to source');
  const screenshotPath = testInfo.outputPath('opened-file.png');
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('opened-file', { path: screenshotPath, contentType: 'image/png' });
});
