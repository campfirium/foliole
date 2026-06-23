import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const EVIDENCE_DIR = path.resolve('.lab/atlas/0active');
const METRICS_PATH = path.join(EVIDENCE_DIR, 'document-header-breadcrumb-spacing.json');
const SCREENSHOT_PATH = path.join(EVIDENCE_DIR, 'document-header-breadcrumb-spacing.png');

async function collectHeaderSpacingMetrics(desktopWindow: import('@playwright/test').Page) {
  return desktopWindow.evaluate(() => {
    const rail = document.querySelector('[data-testid="document-header-content-rail"]');
    const navigationActions = document.querySelector('[aria-label="Document navigation actions"], [aria-label="文档导航操作"]');
    const breadcrumbs = document.querySelector('[aria-label="Node breadcrumbs"], [aria-label="面包屑"]');

    const railRect = rail?.getBoundingClientRect() ?? null;
    const navigationRect = navigationActions?.getBoundingClientRect() ?? null;
    const breadcrumbsRect = breadcrumbs?.getBoundingClientRect() ?? null;

    return {
      breadcrumbOffsetFromRail: railRect && breadcrumbsRect ? Math.round(breadcrumbsRect.left - railRect.left) : null,
      navigationBreadcrumbGap: navigationRect && breadcrumbsRect ? Math.round(breadcrumbsRect.left - navigationRect.right) : null
    };
  });
}

test('keeps document navigation and breadcrumbs in one compact header rail', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await expect(desktopWindow.getByTestId('document-header-content-rail')).toBeVisible();

  const metrics = await collectHeaderSpacingMetrics(desktopWindow);
  const screenshot = await desktopWindow.screenshot();
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(METRICS_PATH, `${JSON.stringify(metrics, null, 2)}\n`);
  await writeFile(SCREENSHOT_PATH, screenshot);
  await testInfo.attach('document-header-breadcrumb-spacing', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach('document-header-breadcrumb-spacing-screenshot', {
    body: screenshot,
    contentType: 'image/png'
  });

  expect(metrics.breadcrumbOffsetFromRail).toBeGreaterThan(0);
  expect(metrics.navigationBreadcrumbGap).toBeGreaterThanOrEqual(8);
  expect(metrics.navigationBreadcrumbGap).toBeLessThanOrEqual(16);
});
