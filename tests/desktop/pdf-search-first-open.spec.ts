import path from 'node:path';

import { expect, test } from './harness/fixtures';

test('global search reveals a PDF match on its first open @pdf', async ({ desktopApp, desktopWindow }) => {
  const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  await exitFlow.click();
  const fixture = path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf');
  await desktopApp.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, fixture);
  const imported = await desktopWindow.evaluate(() => window.electronAPI!.invoke('run_text_file_import', {}));
  expect(imported).toMatchObject({ node_id: expect.any(String) });
  await expect(desktopWindow.getByTestId('pdf-scroll-container')).toHaveCount(0);

  await desktopWindow.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  const prompt = desktopWindow.getByRole('button', { name: /^(Not now|暂不)$/ });
  await expect(prompt).toBeVisible();
  await prompt.click();
  const dialog = desktopWindow.getByRole('dialog', { name: /Workspace search|工作区搜索/ });
  await dialog.getByRole('textbox', { name: /Search workspace|搜索工作区/ }).fill('gamma keyword');
  const result = dialog.getByRole('button').filter({ hasText: /^pdf-user-journey\.pdf/ });
  await expect(result).toBeVisible({ timeout: 30000 });
  await result.click();
  await expect(dialog).toBeHidden();
  await expect(desktopWindow.getByTestId('pdf-document-loading-overlay')).toBeHidden({ timeout: 30000 });
  const target = desktopWindow.locator('[data-pdf-page-number="3"]');
  await expect(target.locator('canvas')).toBeInViewport({ timeout: 30000 });
  await expect(target.getByTestId('pdf-search-match-active')).toBeInViewport({ timeout: 30000 });
  await expect.poll(() => target.locator('.textLayer span').filter({ hasText: 'gamma keyword' }).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return !!hit && !!element.closest('[data-pdf-page-number]')?.contains(hit);
  })).toBe(true);
  await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/pdf-search-first-open.png') });
  const input = desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ });
  await expect(input).toHaveValue('3');
  await input.fill('1');
  await input.press('Enter');
  await expect(desktopWindow.locator('[data-pdf-page-number="1"] canvas')).toBeInViewport();
  await expect(input).toHaveValue('1');
});
