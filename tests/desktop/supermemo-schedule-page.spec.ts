import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { card, confirmStep, gradesStep, loadSource, openPreview, parameters, structureStep } from './harness/superMemoImport';

const oneDate = card.replace('<ID>2</ID>', '<ID>3</ID>').replace('<Title>Card</Title>', '<Title>Source only</Title>')
  .replace(/<RepHist>.*<\/RepHist>/, '');
const xml = `<SuperMemoCollection><Count>2</Count>${card}${oneDate}</SuperMemoCollection>`;
const plannedDate = /^(After import|导入后日期)$/;
const previousImport = /Previous import|历史导入批次/;

test('compares real first review dates and restores the selected proportion', async ({ desktopWindow, desktopApp }, testInfo) => {
  const dialog = await openPreview(desktopWindow);
  await loadSource(desktopApp, dialog, testInfo.outputPath('Schedule'), xml);
  await expect(dialog.getByRole('button', { name: structureStep })).toHaveAttribute('aria-current', 'step');
  await dialog.getByRole('button', { name: parameters }).click();

  const dateTable = dialog.getByRole('table').filter({ has: desktopWindow.getByRole('columnheader', { name: plannedDate }) });
  const compare = dateTable.getByRole('row', { name: /^Card / }).getByRole('cell');
  const source = '2027-09-06';
  await expect(compare.nth(0)).toHaveText(source);
  await expect(compare.nth(2)).toHaveText(source);
  const calculated = (await compare.nth(1).innerText()).trim();
  expect(calculated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(calculated).not.toBe(source);

  const slider = dialog.getByRole('slider');
  await slider.press('End');
  await expect(compare.nth(2)).toHaveText(calculated);
  await dialog.getByText(/^(Date exceptions \(1\)|日期异常（1）)$/).click();
  const exception = dateTable.getByRole('row', { name: /^Source only / }).getByRole('cell');
  await expect(exception.nth(1)).toHaveText(/^(Unavailable|不可用)$/);
  await expect(exception.nth(2)).toHaveText(source);

  const artifact = path.resolve('.tmp/artifacts/T762-7');
  await mkdir(artifact, { recursive: true });
  await dialog.screenshot({ path: path.join(artifact, 'schedule-preview.png') });

  await dialog.getByRole('button', { name: gradesStep }).click();
  await dialog.getByRole('button', { name: parameters }).click();
  await expect(slider).toHaveValue('100');
  await expect(compare.nth(2)).toHaveText(calculated);
  await dialog.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const restored = await openPreview(desktopWindow);
  await expect(restored.getByRole('button', { name: structureStep })).toHaveAttribute('aria-current', 'step');
  await restored.getByRole('button', { name: parameters }).click();
  await expect(slider).toHaveValue('100');
  await expect(compare.nth(2)).toHaveText(calculated);

  await restored.getByRole('button', { name: confirmStep }).click();
  await restored.getByRole('button', { name: /^(Convert|转换)$/ }).click();
  await expect(restored.getByText(/^(Imported 2|已导入 2 条)/)).toBeVisible();
  await restored.getByRole('button', { name: /^(Close|关闭)$/ }).click();
  const existing = await openPreview(desktopWindow);
  await expect(existing.getByRole('combobox', { name: previousImport })).toBeVisible();
  await existing.getByRole('button', { name: parameters }).click();
  await expect(existing.getByText(/batch’s saved proportion|批次已保存的比例/)).toBeVisible();
  await expect(slider).toHaveCount(0);
  await existing.getByRole('button', { name: /^(Load data|载入数据)$/ }).click();
  await existing.getByRole('combobox', { name: previousImport }).selectOption({ index: 1 });
  await expect(slider).toHaveValue('100');
  await slider.press('Home');
  await existing.getByRole('button', { name: /^(Apply first review dates|应用首次复习日期)$/ }).click();
  await expect(existing.getByText(/^(Updated 1|已更新 1 张)/)).toBeVisible();
});
