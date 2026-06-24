import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('workspace rail command palette tooltip uses localized copy', async ({ desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    window.localStorage.setItem('foliole-app-language', 'zh-Hans');
    window.localStorage.setItem('foliole-workspace-rail-items', JSON.stringify([
      {
        commandId: 'desktop.command.openCommandPalette',
        iconId: 'SquareChevronRight',
        id: 'system.command-palette',
        order: 0,
        section: 'top',
        source: 'system',
        visible: true
      }
    ]));
    window.location.reload();
  });
  await expectWorkspaceShell(desktopWindow);
  const ribbon = desktopWindow.getByRole('region', { name: /Workspace Ribbon|工作区功能区/ });
  const commandPaletteButton = ribbon.getByRole('button', { name: '命令面板' });

  await commandPaletteButton.hover();

  const tooltip = desktopWindow.getByRole('tooltip', { name: '命令面板' });
  await expect(tooltip).toBeVisible();
  await expect(desktopWindow.getByText(/desktop\.command\./)).toHaveCount(0);
  const screenshotPath = '.lab/atlas/0active/workspace-rail-command-palette-tooltip.png';
  await testInfo.attach('workspace-rail-command-palette-tooltip', {
    body: await desktopWindow.screenshot({ path: screenshotPath }),
    contentType: 'image/png'
  });
});
