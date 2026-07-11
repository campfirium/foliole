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

  const directButton = desktopWindow.getByRole('button', { name: /Foliole Aide.*panel|Foliole Aide面板/ });
  if (await directButton.count()) await directButton.first().click();
  else {
    await desktopWindow.getByRole('button', { name: /More right sidebar panels|更多右侧栏面板/ }).click();
    await desktopWindow.getByRole('menuitem', { name: /Foliole Aide/ }).click();
  }

  await desktopWindow.getByRole('button', { name: /^(Connect|连接)$/ }).click();
  await expect(desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/))
    .toBeVisible({ timeout: 15_000 });

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-desktop-runtime-connect', {
    path: screenshotPath,
    contentType: 'image/png'
  });
});
