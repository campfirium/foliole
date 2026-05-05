import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function collectStarterLayoutMetrics(desktopWindow: import('@playwright/test').Page) {
  return desktopWindow.evaluate(() => {
    const folderPanel = document.querySelector('[aria-label="Node list panel"]');
    const topicPanel = document.querySelector('[aria-label="Current folder contents"]');
    const separator = document.querySelector('[aria-label="Resize folder list"]');
    const workspace = document.querySelector('[aria-label="Foliole workspace"]');
    const activeNodeId = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
    const listWidthValue = getComputedStyle(workspace ?? document.documentElement)
      .getPropertyValue('--workspace-list-current-width')
      .trim();

    if (!folderPanel || !topicPanel || !separator) {
      return {
        activeNodeId,
        folderPanelWidth: null,
        leftRegionWidth: null,
        listWidthValue,
        separatorWidth: null,
        topicPanelWidth: null
      };
    }

    const folderRect = folderPanel.getBoundingClientRect();
    const topicRect = topicPanel.getBoundingClientRect();
    const separatorRect = separator.getBoundingClientRect();

    return {
      activeNodeId,
      folderPanelWidth: Math.round(folderRect.width),
      leftRegionWidth: Math.round(topicRect.right - folderRect.left),
      listWidthValue,
      separatorWidth: Math.round(separatorRect.width),
      topicPanelWidth: Math.round(topicRect.width)
    };
  });
}

test('starter workspace uses 200px folder column inside 450px left region', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await expect(desktopWindow.getByRole('button', { name: 'Welcome to Foliole', exact: true })).toBeVisible();

  const metrics = await collectStarterLayoutMetrics(desktopWindow);
  await testInfo.attach('starter-layout-metrics', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach('starter-layout-screenshot', {
    body: await desktopWindow.screenshot(),
    contentType: 'image/png'
  });

  expect(metrics.activeNodeId).toBe('starter-welcome');
  expect(metrics.listWidthValue).toBe('450px');
  expect(metrics.folderPanelWidth).toBe(200);
  expect(metrics.separatorWidth).toBe(1);
  expect(metrics.topicPanelWidth).toBe(249);
  expect(metrics.leftRegionWidth).toBe(450);
});
