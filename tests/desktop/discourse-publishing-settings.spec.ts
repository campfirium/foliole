import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { test, expect } from './harness/fixtures';
import { openSettingsDialog } from './harness/settings';

type RowLayout = {
  inputWidth: number;
  paragraphWidth: number;
  title: string;
};

async function collectPublishingRowLayouts(dialog: import('@playwright/test').Locator): Promise<RowLayout[]> {
  return dialog.getByRole('region', {
    name: /^(Publishing settings section|发布设置区)$/
  }).locator('[data-settings-row]').evaluateAll((rows) =>
    rows.map((row) => {
      const title = row.querySelector('h4')?.textContent?.trim() ?? '';
      const paragraph = row.querySelector('p');
      const input = row.querySelector('input');
      return {
        inputWidth: input?.getBoundingClientRect().width ?? 0,
        paragraphWidth: paragraph?.getBoundingClientRect().width ?? 0,
        title
      };
    })
  );
}

test('keeps Discourse publishing settings compact and per-topic publish fields out of global settings', async ({ desktopWindow }, testInfo) => {
  const dialog = await openSettingsDialog(desktopWindow);
  await dialog.getByRole('button', { name: /^(Publishing|发布)$/ }).click();

  await expect(dialog.getByRole('heading', { name: /^(Discourse forum|Discourse 论坛)$/ })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: /^(Discourse forum address|Discourse 论坛地址)$/ })).toBeVisible();
  await expect(dialog.getByLabel(/^(Discourse User API key|Discourse User API Key)$/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Save|保存)$/ })).toHaveCount(0);
  await expect(dialog.getByText(/^(API username|API 用户名)$/)).toHaveCount(0);
  await expect(dialog.getByText(/^(Default category ID|默认分类 ID)$/)).toHaveCount(0);
  await expect(dialog.getByText(/^(Default tags|默认标签)$/)).toHaveCount(0);

  const apiKeyInput = dialog.getByLabel(/^(Discourse User API key|Discourse User API Key)$/);
  await apiKeyInput.fill('playwright-discourse-user-api-key');
  await apiKeyInput.blur();
  await expect(apiKeyInput).toHaveValue('');
  await expect(apiKeyInput).toHaveAttribute('placeholder', '****************');

  const layouts = await collectPublishingRowLayouts(dialog);
  expect(layouts).toHaveLength(2);
  for (const layout of layouts) {
    expect(layout.paragraphWidth, `${layout.title} description should not collapse into a narrow column`).toBeGreaterThan(280);
    expect(layout.inputWidth, `${layout.title} input should keep a normal settings width`).toBeGreaterThan(320);
  }

  const screenshot = await desktopWindow.screenshot({ fullPage: true });
  const screenshotDir = path.join(process.cwd(), '.tmp', 'artifacts');
  const screenshotPath = path.join(screenshotDir, 'discourse-publishing-settings-hidden-native.png');
  await mkdir(screenshotDir, { recursive: true });
  await writeFile(screenshotPath, screenshot);
  await testInfo.attach('discourse-publishing-settings', {
    body: screenshot,
    contentType: 'image/png'
  });
});
