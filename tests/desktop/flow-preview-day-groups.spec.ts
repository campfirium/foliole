import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SCREENSHOT_PATH = path.resolve(
  '.lab/atlas/0active/flow-preview-day-groups-hidden.png'
);

test('desktop Flow panel does not show Demo preview day controls in normal runtime', async ({
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);

  const inspector = desktopWindow.getByRole('complementary', {
    name: /Inspector|检查器/
  });
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('Flow');
  await expect(inspector.getByLabel(/Demo Flow (notice|提示)/)).toHaveCount(0);
  await expect(inspector.getByText('Day 1')).toHaveCount(0);
  await expect(inspector.getByText('Day 2')).toHaveCount(0);

  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
});
