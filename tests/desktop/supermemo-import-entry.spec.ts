import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { card, loadSource, openPreview, parameters } from './harness/superMemoImport';

const importCommand = /^(Import from SuperMemo|从 SuperMemo 导入)$/;
const previewTitle = /^(SuperMemo import|SuperMemo 导入)$/;
const internalBuild = process.env.FOLIOLE_TEST_INTERNAL_RENDERER === '1';

test('opens SuperMemo migration from the command palette and shares the draft with the desktop entry points', async ({ desktopWindow, desktopApp }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const toolbar = desktopWindow.getByRole('region', { name: /Left toolbar|左侧工具栏/ });
  const shortcut = toolbar.getByRole('button', { name: importCommand });
  await expect(shortcut).toHaveCount(internalBuild ? 1 : 0);
  if (internalBuild) {
    await expect(shortcut).toBeVisible();
    await desktopWindow.screenshot({ path: testInfo.outputPath('supermemo-left-toolbar.png') });
  }

  await toolbar.getByRole('button', { name: /^(Command Palette|命令面板)$/ }).click();
  const palette = desktopWindow.getByRole('dialog', { name: /^(Command palette|命令面板)$/ });
  await palette.getByRole('textbox').fill('SuperMemo');
  await palette.getByRole('button', { name: importCommand }).click();
  const preview = desktopWindow.getByRole('dialog', { name: previewTitle });
  await expect(preview).toBeVisible();
  await expect(palette).toBeHidden();
  await expect(desktopWindow.locator('[data-settings-root-dialog]')).toHaveCount(0);

  const xml = `<SuperMemoCollection><Count>1</Count>${card}</SuperMemoCollection>`;
  await loadSource(desktopApp, preview, testInfo.outputPath('Example'), xml);
  await expect(preview.getByText('Example', { exact: true })).toBeVisible();
  await preview.getByRole('button', { name: parameters }).click();
  await preview.getByRole('slider').press('End');
  await expect(preview.getByRole('slider')).toHaveValue('100');
  await preview.press('Escape');
  await expect(preview).toBeHidden();

  if (internalBuild) {
    await shortcut.click();
    await expect(preview.getByRole('slider')).toHaveValue('100');
    await preview.press('Escape');
    await expect(preview).toBeHidden();
  }

  const reopened = await openPreview(desktopWindow);
  await expect(reopened.getByRole('slider')).toHaveValue('100');
  await expect(reopened.getByText('Example', { exact: true })).toBeVisible();
});
