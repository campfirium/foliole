import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-desktop-runtime-connect.png'
);

test('Aide Connect discovers the signed-in Codex Desktop runtime', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.removeItem('foliole-aide-enabled');
  });
  await desktopWindow.reload();

  const connectButton = desktopWindow.getByRole('button', { name: /^(Connect|连接)$/ });
  if (!await connectButton.isVisible().catch(() => false)) {
    const directButton = desktopWindow.getByRole('button', {
      name: /Foliole Aide.*(?:panel|面板)/
    });
    await directButton.first().waitFor({ state: 'visible' });
    await directButton.first().click();
  }

  await connectButton.click();
  await expect(desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/))
    .toBeVisible({ timeout: 15_000 });
  await expect(desktopWindow.getByText(
    /Foliole Aide (?:could not load local history|未能加载本地历史)/
  )).toHaveCount(0);

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-desktop-runtime-connect', {
    path: screenshotPath,
    contentType: 'image/png'
  });
});
