import { appendFile, rename, writeFile } from 'node:fs/promises';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { card, gradesStep, loadSource, openPreview, parameters, structureStep, writeCollection } from './harness/superMemoImport';

const xml = `<SuperMemoCollection><Count>1</Count>${card}</SuperMemoCollection>`;
const load = /^(Choose XML|选择 XML)$/;
const noticeTitle = /^(Could not load SuperMemo|无法载入 SuperMemo)$/;

test('restores migration pages from a single JSON without access to the original files', async ({
  desktopApp, desktopSession, desktopWindow
}, info) => {
  const exportDirectory = info.outputPath('SavedMigration');
  const collection = info.outputPath('Collection');
  await writeCollection(collection, false);
  const marker = 'Unique source question for migration state';
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, exportDirectory, xml.replace('<Question>Question</Question>',
    `<Question>${marker}</Question>`), load, collection);
  await dialog.getByRole('button', { name: parameters }).click();
  await dialog.getByRole('slider').press('End');
  await dialog.getByRole('button', { name: structureStep }).click();
  await expect(dialog.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();

  const records = await desktopApp.evaluate(async ({ app }) => {
    const fs = process.getBuiltinModule('fs/promises')!;
    const path = process.getBuiltinModule('path')!;
    const directory = path.join(app.getPath('userData'), 'supermemo-migration');
    const names = (await fs.readdir(directory)).filter(name => name.endsWith('.json'));
    return Promise.all(names.map(name => fs.readFile(path.join(directory, name), 'utf8')));
  });
  expect.soft(records).toHaveLength(1);
  expect.soft(records.join('')).not.toContain(marker);

  await rename(exportDirectory, info.outputPath('MovedExport'));
  await rename(collection, info.outputPath('MovedCollection'));
  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot };
  await desktopApp.close();
  const restarted = await launchDesktopSession({ env });
  try {
    await expectWorkspaceShell(restarted.firstWindow);
    const reopened = await openPreview(restarted.firstWindow);
    await expect(reopened.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
    await reopened.getByRole('button', { name: parameters }).click();
    await expect(reopened.getByRole('slider')).toHaveValue('100');
    await reopened.getByRole('button', { name: gradesStep }).click();
    await expect(restarted.firstWindow.getByRole('dialog', { name: noticeTitle })).toHaveCount(0);
    await reopened.getByRole('button', { name: /^(Import|导入)$/ }).click();
    await expect(restarted.firstWindow.getByRole('dialog', { name: noticeTitle })).toBeVisible();
  } finally {
    await restarted.close();
  }
});

test('detects a changed XML after opening and checks it again before conversion', async ({
  desktopApp, desktopWindow
}, info) => {
  const exportDirectory = info.outputPath('ChangedMigration');
  const file = info.outputPath('ChangedMigration', 'ChangedMigration.xml');
  const original = await openPreview(desktopWindow);
  await loadSource(desktopApp, original, exportDirectory, xml);
  await expect(original.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
  await original.press('Escape');
  await writeFile(file, xml.replace('<Title>Card</Title>', '<Title>Changed</Title>'));

  const dialog = await openPreview(desktopWindow);
  const changed = desktopWindow.getByRole('dialog', { name: /^(SuperMemo source changed|SuperMemo 来源已变化)$/ });
  await expect(changed).toBeVisible();
  await changed.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await expect(dialog.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
  await dialog.getByRole('button', { name: gradesStep }).click();
  await dialog.getByRole('button', { name: /^(Import|导入)$/ }).click();
  await expect(changed).toBeVisible();
});

test('detects changes to the paired collection without changing the saved migration', async ({
  desktopApp, desktopWindow
}, info) => {
  const collection = info.outputPath('ChangedCollection');
  await writeCollection(collection, false);
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, info.outputPath('PairedExport'), xml, load, collection);
  await expect(dialog.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
  await dialog.getByRole('button', { name: gradesStep }).click();
  await appendFile(info.outputPath('ChangedCollection', 'info', 'ElementInfo.dat'), Buffer.from([1]));
  await dialog.getByRole('button', { name: /^(Import|导入)$/ }).click();

  const changed = desktopWindow.getByRole('dialog', { name: /^(SuperMemo source changed|SuperMemo 来源已变化)$/ });
  await expect(changed).toBeVisible();
  await changed.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await dialog.getByRole('button', { name: structureStep }).click();
  await expect(dialog.getByRole('button', { name: /^Card.*#2$/ })).toBeVisible();
});
