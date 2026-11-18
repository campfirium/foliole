import { realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { card, confirmStep, loadSource, openPreview, parameters, structureStep, sourceStep, writeCollection } from './harness/superMemoImport';

const xml = `<SuperMemoCollection><Count>1</Count>${card}</SuperMemoCollection>`;
const close = /^(Close|关闭)$/;
const load = /^(Choose XML|选择 XML)$/;
const noticeTitle = /^(Could not load SuperMemo|无法载入 SuperMemo)$/;

test('remembers the last valid XML link and migration form across an app restart', async ({
  desktopApp, desktopSession, desktopWindow
}, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  await expect(dialog.getByRole('button', { name: load })).toBeEnabled();
  const folder = testInfo.outputPath('Remembered');
  await loadSource(desktopApp, dialog, folder, xml);
  await expect(dialog.getByText(/(?:^Remembered$|[/\\]Remembered\.xml$)/)).toBeVisible();
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('slider').press('End');
  await dialog.getByRole('button', { name: sourceStep }).click();
  await dialog.getByRole('radio', { name: /^(End of each material’s content|所有材料的内容末尾)$/ }).click();
  await loadSource(desktopApp, dialog, testInfo.outputPath('Broken'), '<broken>');
  await desktopWindow.getByRole('region', { name: noticeTitle }).getByRole('button', { name: close }).click();
  await expect(dialog.getByText(/(?:^Remembered$|[/\\]Remembered\.xml$)/)).toBeVisible();
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
    await expect(reopened.getByText(/^Remembered(?:\.xml)?$/)).toBeVisible();
    await expect(reopened.getByRole('slider')).toHaveValue('100');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await reopened.getByRole('button', { name: /^(Load data|载入数据)$/ }).click();
    await expect(reopened.getByRole('button', { name: /View source preview|查看原始预览/ })).toHaveCount(0);
    await reopened.screenshot({ path: testInfo.outputPath('remembered-xml.png') });
    await reopened.getByRole('button', { name: structureStep }).click();
    await expect(reopened.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
    await reopened.getByRole('button', { name: parameters }).click();
    await expect(reopened.getByRole('slider')).toHaveValue('100');
    await reopened.getByRole('button', { name: sourceStep }).click();
    await expect(reopened.getByRole('radio', { name: /^(End of each material’s content|所有材料的内容末尾)$/ })).toBeChecked();

    await reopened.getByRole('button', { name: /^(Load data|载入数据)$/ }).click();
    await expect(reopened.getByText(await realpath(folder) + '/Remembered.xml', { exact: true })).toBeVisible();
    await expect(reopened.getByRole('button', { name: /^(Remove selection|移除选择)$/ })).toHaveCount(0);
    await expect(reopened.getByText(/File → Export|Last loaded|上次载入/)).toHaveCount(0);
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

  await dialog.getByRole('button', { name: structureStep }).click();
  await rename(collection, testInfo.outputPath('Moved collection'));
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const reopened = await openPreview(desktopWindow);
  await expect(reopened.getByRole('button', { name: structureStep })).toHaveAttribute('aria-current', 'step');
  await expect(reopened.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
  const notice = desktopWindow.getByRole('dialog', { name: noticeTitle });
  await expect(reopened.getByText(/(?:^Export$|[/\\]Export\.xml$)/)).toBeVisible();
  await expect(notice).toHaveCount(0);
  await reopened.getByRole('button', { name: confirmStep }).click();
  await reopened.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(notice.getByText(/could not read the original collection files|无法读取原资料库的配套文件/)).toBeVisible();
  await notice.getByRole('button', { name: /^(Continue with XML|继续使用 XML)$/ }).click();
  await expect(reopened.getByText(/(?:^Export$|[/\\]Export\.xml$)/)).toBeVisible();
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
  await expect(dialog.getByText(/No folder matched|未配对/)).toBeVisible();
  await expect(dialog.getByText(/(?:^Export$|[/\\]Export\.xml$)/)).toBeVisible();
  const elements = await writeCollection(collection, false);
  elements.writeUInt16LE(200, 118 + 16);
  const elementInfo = path.join(collection, 'info', 'ElementInfo.dat');
  await writeFile(elementInfo, elements);
  const pickCollection = /^(Choose collection folder|选择资料库文件夹)$/;
  await loadSource(desktopApp, dialog, exportFolder, undefined, pickCollection, collection);
  const recovery = dialog.getByRole('region', { name: noticeTitle });
  await expect(recovery.getByText(/does not match this XML export|此 XML 导出不匹配|与此 XML 导出不匹配/)).toBeVisible();
  await expect(dialog.getByText(/(?:^Export$|[/\\]Export\.xml$)/)).toBeVisible();

  elements.writeUInt16LE(300, 118 + 16);
  await writeFile(elementInfo, elements);
  await recovery.getByRole('button', { name: pickCollection }).click();
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(dialog.getByRole('slider')).toHaveValue('100');
  await expect(dialog.getByText(/Candidate dates and priority order come from|候选日期和优先顺序来自/)).toBeVisible();
  await loadStep.click();
  await expect(dialog.getByText(await realpath(collection), { exact: true })).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath('load-data-paired.png') });

  const changeCollection = /^(Change folder|更换文件夹)$/;
  await loadSource(desktopApp, dialog, exportFolder, undefined, changeCollection);
  await expect(dialog.getByText(await realpath(collection), { exact: true })).toBeVisible();

  const replacement = testInfo.outputPath('Replacement collection');
  const replacementElements = await writeCollection(replacement, false);
  replacementElements.writeUInt16LE(200, 118 + 16);
  const replacementInfo = path.join(replacement, 'info', 'ElementInfo.dat');
  await writeFile(replacementInfo, replacementElements);
  await loadSource(desktopApp, dialog, exportFolder, undefined, changeCollection, replacement);
  await expect(recovery.getByText(/export it again in SuperMemo|请在 SuperMemo 中重新导出/)).toBeVisible();
  await expect(dialog.getByText(await realpath(collection), { exact: true })).toBeVisible();

  replacementElements.writeUInt16LE(300, 118 + 16);
  await writeFile(replacementInfo, replacementElements);
  await recovery.getByRole('button', { name: pickCollection }).click();
  await expect(recovery).toBeHidden();
  await loadStep.click();
  await expect(dialog.getByText(await realpath(replacement), { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(dialog.getByRole('slider')).toHaveValue('100');

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const reopened = await openPreview(desktopWindow);
  await reopened.getByRole('button', { name: /^(Load data|载入数据)$/ }).click();
  await expect(reopened.getByText(await realpath(replacement), { exact: true })).toBeVisible();
});

test('starts fresh when the saved data has no migration state', async ({ desktopApp, desktopWindow }, info) => {
  const dialog = await openPreview(desktopWindow);
  const folder = info.outputPath('Legacy');
  await loadSource(desktopApp, dialog, folder, xml);
  await expect(dialog.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
  await desktopApp.evaluate(async ({ app }) => {
    const fs = process.getBuiltinModule('fs/promises')!;
    const path = process.getBuiltinModule('path')!;
    const dir = path.join(app.getPath('userData'), 'supermemo-migration');
    const file = (await fs.readdir(dir)).find(name => /^[a-f\d]{64}\.json$/.test(name));
    if (!file) throw new Error('Missing saved selection');
    const link = path.join(dir, file);
    const data = JSON.parse(await fs.readFile(link, 'utf8'));
    delete data.snapshot;
    delete data.xmlHash;
    await fs.writeFile(link, JSON.stringify(data));
  });

  await desktopWindow.reload();
  const reopened = await openPreview(desktopWindow);
  await expect(reopened.getByRole('button', { name: load })).toBeEnabled();
  await expect(reopened.getByRole('button', { name: /^(Load data|载入数据)$/ })).toHaveAttribute('aria-current', 'step');
  await expect(reopened.getByText('Legacy', { exact: true })).toHaveCount(0);
  await expect(desktopWindow.getByRole('dialog', { name: noticeTitle })).toHaveCount(0);

  await loadSource(desktopApp, reopened, folder);
  await expect(reopened.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
});
