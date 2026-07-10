import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/guided-sample-content-hidden.png');

test('guided sample keeps its image and explains how to restore the bottom action bar', async ({
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);

  await desktopWindow
    .getByRole('button', { name: /^(Reading: Break the Whole into Pieces|阅读：化整为零)$/ })
    .click();

  const workspace = desktopWindow.getByRole('main', { name: /^(Foliole workspace|Foliole 工作区)$/ });
  await expect(workspace).toContainText(
    /(If the bottom action bar is not visible, click Enter Flow in the bottom-left corner\.|如果没有看到底部动作条，请点击左下角的“进入 Flow”按钮。)/
  );
  await expect(workspace.getByRole('img', { name: 'image' })).toBeVisible();
  await desktopWindow.screenshot({ fullPage: true, path: SCREENSHOT_PATH });
});
