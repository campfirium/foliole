import { rename } from 'node:fs/promises';
import path from 'node:path';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { card, loadSource, openPreview, parameters, writeCollection } from './harness/superMemoImport';

const xml = `<SuperMemoCollection><Count>1</Count>${card}</SuperMemoCollection>`;
const close = /^(Close|关闭)$/;
const load = /^(Load XML|载入 XML)$/;
const noticeTitle = /^(Could not load SuperMemo|无法载入 SuperMemo)$/;

test('remembers the last valid XML link and migration form across an app restart', async ({
  desktopApp, desktopSession, desktopWindow
}, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  await expect(dialog.getByRole('button', { name: load })).toBeEnabled();
  const folder = testInfo.outputPath('Remembered');
  await loadSource(desktopApp, dialog, folder, xml);
  await expect(dialog.getByText('Remembered.xml', { exact: true })).toBeVisible();
  await loadSource(desktopApp, dialog, testInfo.outputPath('Broken'), '<broken>');
  await desktopWindow.getByRole('dialog', { name: noticeTitle }).getByRole('button', { name: close }).click();
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('slider').press('End');
  await dialog.getByRole('radio', { name: /^(End of each material’s content|所有材料的内容末尾)$/ }).click();
  await dialog.getByRole('button', { name: close }).click();
  await desktopWindow.keyboard.press('Escape');

  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot };
  await desktopApp.close();
  const restarted = await launchDesktopSession({ env });
  try {
    const page = restarted.firstWindow;
    await expectWorkspaceShell(page);
    const reopened = await openPreview(page);
    await expect(reopened.getByText('Remembered.xml', { exact: true })).toBeVisible();
    await expect(reopened.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
    await reopened.getByRole('button', { name: parameters }).click();
    await expect(reopened.getByRole('slider')).toHaveValue('100');
    await expect(reopened.getByRole('radio', { name: /^(End of each material’s content|所有材料的内容末尾)$/ })).toBeChecked();

    await rename(path.join(folder, 'Remembered.xml'), path.join(folder, 'Moved.xml'));
    await page.reload();
    await expectWorkspaceShell(page);
    await openPreview(page);
    await expect(page.getByRole('dialog', { name: noticeTitle })).toBeVisible();
    await expect(page.getByText(/could not read the selected XML file|无法读取所选的 XML 文件/)).toBeVisible();
  } finally {
    await restarted.close();
  }
});

test('can reopen a linked XML when its paired collection moves', async ({ desktopApp, desktopWindow }, testInfo) => {
  const collection = testInfo.outputPath('Collection');
  await writeCollection(collection, false);
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, testInfo.outputPath('Export'), xml, load, collection);
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(dialog.getByText(/Candidate dates and priority order come from|候选日期和优先顺序来自/)).toBeVisible();
  await dialog.getByRole('slider').press('End');

  await rename(collection, testInfo.outputPath('Moved collection'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const reopened = await openPreview(desktopWindow);
  const notice = desktopWindow.getByRole('dialog', { name: noticeTitle });
  await expect(notice.getByText(/could not read the original collection files|无法读取原资料库的配套文件/)).toBeVisible();
  await notice.getByRole('button', { name: /^(Continue with XML|继续使用 XML)$/ }).click();
  await expect(reopened.getByText('Export.xml', { exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: parameters }).click();
  await expect(reopened.getByRole('slider')).toHaveValue('100');
});
