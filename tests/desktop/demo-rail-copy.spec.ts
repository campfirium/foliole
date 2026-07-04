import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts');
const RAIL_COPY_SCREENSHOT_PATH = path.join(ARTIFACT_DIR, 'demo-rail-copy-hidden-native.png');

async function switchToSimplifiedChinese() {
  window.localStorage.setItem('foliole-app-language', 'zh-Hans');
}

test('keeps the desktop rail localized in Simplified Chinese', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(switchToSimplifiedChinese);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);

  const rail = desktopWindow.getByRole('region', { name: '工作区功能区' });
  await expect(rail.getByRole('button', { name: '切换浅色/深色模式' })).toBeVisible();
  await expect(rail.getByRole('button', { name: '设置' })).toBeVisible();
  await expect(rail.getByRole('button', { name: '进入 Flow' })).toBeVisible();

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await rail.screenshot({ path: RAIL_COPY_SCREENSHOT_PATH });
});
