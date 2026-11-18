import { realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { card, loadSource, openPreview, parameters, preparePreview, sourceStep, writeCollection } from './harness/superMemoImport';

const xml = `<SuperMemoCollection><Count>1</Count>${card}</SuperMemoCollection>`;
const close = /^(Close|关闭)$/;
const load = /^(Choose XML|Load XML|选择 XML|载入 XML)$/;
const noticeTitle = /^(Could not load SuperMemo|无法载入 SuperMemo)$/;

test('remembers the last valid XML link and migration form across an app restart', async ({
  desktopApp, desktopSession, desktopWindow
}, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  await expect(dialog.getByRole('button', { name: load })).toBeEnabled();
  const folder = testInfo.outputPath('Remembered');
  await loadSource(desktopApp, dialog, folder, xml);
  await expect(dialog.getByText('Remembered.xml', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('slider').press('End');
  await dialog.getByRole('button', { name: sourceStep }).click();
  await dialog.getByRole('radio', { name: /^(End of each material’s content|所有材料的内容末尾)$/ }).click();
  await loadSource(desktopApp, dialog, testInfo.outputPath('Broken'), '<broken>');
  await desktopWindow.getByRole('region', { name: noticeTitle }).getByRole('button', { name: close }).click();
  await expect(dialog.getByText('Remembered.xml', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(dialog.getByRole('slider')).toHaveValue('100');
  await dialog.getByRole('button', { name: close }).click();
  await desktopWindow.keyboard.press('Escape');

  const original = path.join(folder, 'Remembered.xml');
  const moved = path.join(folder, 'Moved.xml');
  await rename(original, moved);
  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot };
  await desktopApp.close();
  const restarted = await launchDesktopSession({ env });
  try {
    const page = restarted.firstWindow;
    await expectWorkspaceShell(page);
    const reopened = await openPreview(page);
    await expect(reopened.getByText('Remembered.xml', { exact: true })).toBeVisible();
    await expect(reopened.getByRole('slider')).toHaveValue('100');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await reopened.getByRole('button', { name: /^(Load data|载入数据)$/ }).click();
    await reopened.screenshot({ path: testInfo.outputPath('remembered-xml.png') });
    await reopened.getByRole('button', { name: preparePreview }).click();
    const notice = page.getByRole('dialog', { name: noticeTitle });
    await expect(notice.getByText(/could not read the selected XML file|无法读取所选的 XML 文件/)).toBeVisible();
    await expect(notice.getByRole('button', { name: /^(Choose again|重新选择)$/ })).toBeEnabled();
    await notice.getByRole('button', { name: close }).click();
    await expect(reopened.getByText('Remembered.xml', { exact: true })).toBeVisible();
    await rename(moved, original);
    await reopened.getByRole('button', { name: preparePreview }).click();
    await expect(reopened.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
    await reopened.getByRole('button', { name: parameters }).click();
    await expect(reopened.getByRole('slider')).toHaveValue('100');
    await reopened.getByRole('button', { name: sourceStep }).click();
    await expect(reopened.getByRole('radio', { name: /^(End of each material’s content|所有材料的内容末尾)$/ })).toBeChecked();

    await reopened.getByRole('button', { name: /^(Load data|载入数据)$/ }).click();
    await reopened.getByRole('button', { name: /^(Remove selection|移除选择)$/ }).click();
    await expect(reopened.getByRole('button', { name: load })).toBeEnabled();
    await page.reload();
    await expectWorkspaceShell(page);
    await openPreview(page);
    await expect(reopened.getByRole('button', { name: load })).toBeEnabled();
    await expect(reopened.getByText('Remembered.xml', { exact: true })).toHaveCount(0);
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
  await expect(reopened.getByRole('slider')).toHaveValue('100');
  await reopened.getByRole('button', { name: /^(Load data|载入数据)$/ }).click();
  const notice = desktopWindow.getByRole('dialog', { name: noticeTitle });
  await expect(reopened.getByText('Export.xml', { exact: true })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await reopened.getByRole('button', { name: preparePreview }).click();
  await expect(notice.getByText(/could not read the original collection files|无法读取原资料库的配套文件/)).toBeVisible();
  await notice.getByRole('button', { name: /^(Continue with XML|继续使用 XML)$/ }).click();
  await expect(reopened.getByText('Export.xml', { exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: parameters }).click();
  await expect(reopened.getByRole('slider')).toHaveValue('100');
});

test('pairs an already loaded XML from Load data without replacing its draft settings', async ({
  desktopApp, desktopWindow
}, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  const loadStep = dialog.getByRole('button', { name: /^(Load data|载入数据)$/ });
  const collection = testInfo.outputPath('Moved collection');
  const exportFolder = testInfo.outputPath('Export');
  await expect(dialog.getByText(/File → Export/)).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath('load-data-guide.png') });
  await loadSource(desktopApp, dialog, exportFolder, xml);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('slider').press('End');
  await loadStep.click();
  await expect(dialog.getByText(/^(XML loaded · collection files unavailable|已载入 XML · 无配套资料)$/)).toBeVisible();
  await expect(dialog.getByText('Export.xml', { exact: true })).toBeVisible();
  const elements = await writeCollection(collection, false);
  elements.writeUInt16LE(200, 118 + 16);
  const elementInfo = path.join(collection, 'info', 'ElementInfo.dat');
  await writeFile(elementInfo, elements);
  const pickCollection = /^(Choose collection folder|选择资料库文件夹)$/;
  await loadSource(desktopApp, dialog, exportFolder, undefined, pickCollection, collection);
  const recovery = dialog.getByRole('region', { name: noticeTitle });
  await expect(recovery.getByText(/does not match this XML export|此 XML 导出不匹配|与此 XML 导出不匹配/)).toBeVisible();
  await expect(dialog.getByText('Export.xml', { exact: true })).toBeVisible();

  elements.writeUInt16LE(300, 118 + 16);
  await writeFile(elementInfo, elements);
  await recovery.getByRole('button', { name: pickCollection }).click();
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(dialog.getByRole('slider')).toHaveValue('100');
  await expect(dialog.getByText(/Candidate dates and priority order come from|候选日期和优先顺序来自/)).toBeVisible();
  await loadStep.click();
  await expect(dialog.getByText(/^(XML and collection files loaded|已载入 XML 和配套资料)$/)).toBeVisible();
  await expect(dialog.getByText(await realpath(collection), { exact: true })).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath('load-data-paired.png') });
});
