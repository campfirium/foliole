import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const EVIDENCE_DIR = path.join(process.cwd(), '.tmp/artifacts/desktop-acceptance');
const RESTING_SCREENSHOT_PATH = path.join(EVIDENCE_DIR, 'workspace-update-action-resting.png');
const HOVER_SCREENSHOT_PATH = path.join(EVIDENCE_DIR, 'workspace-update-action-hover.png');

test('shows the ready update action prominently above Restart App', async ({ desktopSession, desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-workspace-rail-items', JSON.stringify([{
      commandId: 'workspace.restartApp',
      iconId: 'Power',
      id: 'user.restart-app',
      labelOverride: 'desktop.command.restartApp',
      order: -1,
      section: 'bottom',
      source: 'user',
      visible: true
    }]));
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const rail = desktopWindow.getByRole('region', { name: /Left toolbar|左侧工具栏/ });
  const updateAction = rail.getByRole('button', { name: /^(Restart to install update|重启并安装更新)$/ });
  await expect(updateAction).toHaveCount(0);

  await desktopSession.electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())?.webContents.send(
      'foliole:desktop-update-state',
      { percent: 100, phase: 'ready', version: '0.7.0' }
    );
  });

  await expect(updateAction).toBeVisible();
  await expect(updateAction.locator('.lucide-circle-arrow-down')).toBeVisible();
  const restartAction = rail.getByRole('button', { name: /Restart App|重启应用/ });
  const [updateBox, restartBox] = await Promise.all([
    updateAction.boundingBox(),
    restartAction.boundingBox()
  ]);
  expect(updateBox?.y).toBeLessThan(restartBox?.y ?? 0);
  await expect.poll(() => updateAction.evaluate((element) => getComputedStyle(element).animationName))
    .toContain('workspace-update-nudge');
  const clip = { height: 96, width: 150, x: 0, y: Math.max(0, (updateBox?.y ?? 8) - 8) };
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await desktopWindow.waitForTimeout(2900);
  await desktopWindow.screenshot({ clip, path: RESTING_SCREENSHOT_PATH });
  const restingWidth = (await updateAction.boundingBox())?.width;
  await updateAction.hover();
  await expect(desktopWindow.getByRole('tooltip')).toHaveText(/^(Restart to install update|重启并安装更新)$/);
  expect((await updateAction.boundingBox())?.width).toBe(restingWidth);
  await desktopWindow.screenshot({ clip, path: HOVER_SCREENSHOT_PATH });
  await testInfo.attach('workspace-update-action-resting', { path: RESTING_SCREENSHOT_PATH });
  await testInfo.attach('workspace-update-action-hover', { path: HOVER_SCREENSHOT_PATH });
});
