import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('workspace rail command palette tooltip uses localized copy', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const ribbon = desktopWindow.getByRole('region', { name: /Workspace Ribbon|工作区功能区/ });
  const commandPaletteButton = ribbon.getByRole('button', { name: /Command Palette|命令面板/ });

  await commandPaletteButton.hover();

  const tooltip = desktopWindow.getByRole('tooltip', { name: /Command Palette|命令面板/ });
  await expect(tooltip).toBeVisible();
  await expect(desktopWindow.getByText(/desktop\.command\./)).toHaveCount(0);
  const screenshotPath = '.lab/atlas/0active/workspace-rail-command-palette-tooltip.png';
  await testInfo.attach('workspace-rail-command-palette-tooltip', {
    body: await desktopWindow.screenshot({ path: screenshotPath }),
    contentType: 'image/png'
  });
});
