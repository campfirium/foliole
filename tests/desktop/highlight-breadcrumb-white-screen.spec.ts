import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedHighlightParentAndChild(desktopWindow: Page) {
  await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: 'Alpha Beta Gamma',
        id: 'playwright-parent-topic',
        kind: 'topic',
        title: 'Playwright Parent'
      },
      {
        anchorLink: {
          id: 'hl-playwright-1',
          kind: 'highlight',
          locator: {
            from: 6,
            originalText: 'Beta',
            to: 10
          }
        },
        content: 'Beta',
        id: 'playwright-highlight-child',
        kind: 'topic',
        parentNodeId: 'playwright-parent-topic',
        title: 'Playwright Highlight Child'
      }
    ]);
    await api?.openNode?.('playwright-highlight-child');
  });
}

async function collectWorkspaceSurfaceState(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const debugApi = globalThis.window?.__folioleWorkspaceDebug;
    const workspace = document.querySelector('[aria-label="Foliole workspace"]');
    const breadcrumbs = document.querySelector('[aria-label="Node breadcrumbs"]');
    const documentPanel = document.querySelector('[aria-label="Document panel"]');
    const headerButtons = Array.from(document.querySelectorAll('button'))
      .map((button) => button.textContent?.trim() ?? '')
      .filter(Boolean)
      .slice(0, 40);
    return {
      activeNodeId: debugApi?.getActiveNodeId?.() ?? null,
      breadcrumbText: breadcrumbs?.textContent ?? null,
      bodyTextLength: document.body.textContent?.trim().length ?? 0,
      documentPanelExists: Boolean(documentPanel),
      headerButtons,
      workspaceExists: Boolean(workspace)
    };
  });
}

test('clicking breadcrumb from a highlight child keeps the parent document visible', async ({ desktopWindow }, testInfo) => {
  const pageErrors: string[] = [];
  desktopWindow.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await expectWorkspaceShell(desktopWindow);
  await seedHighlightParentAndChild(desktopWindow);

  const beforeClickState = await collectWorkspaceSurfaceState(desktopWindow);
  console.log('highlight-breadcrumb-before-click', JSON.stringify(beforeClickState));
  await testInfo.attach('highlight-breadcrumb-before-click', {
    body: JSON.stringify(beforeClickState, null, 2),
    contentType: 'application/json'
  });

  await expect(desktopWindow.getByRole('button', { name: 'Playwright Highlight Child', exact: true })).toBeVisible();
  await expect(desktopWindow.getByRole('navigation', { name: 'Node breadcrumbs' })).toBeVisible();
  await desktopWindow.getByRole('navigation', { name: 'Node breadcrumbs' }).getByRole('button', { name: 'Playwright Parent' }).click();

  const afterClickState = await collectWorkspaceSurfaceState(desktopWindow);
  console.log('highlight-breadcrumb-after-click', JSON.stringify({ afterClickState, pageErrors }));
  await testInfo.attach('highlight-breadcrumb-after-click', {
    body: JSON.stringify({ afterClickState, pageErrors }, null, 2),
    contentType: 'application/json'
  });

  const parentTitle = desktopWindow.getByRole('button', { name: 'Playwright Parent', exact: true });
  await expect(parentTitle).toBeVisible({ timeout: 10000 });
  await expect(desktopWindow.locator('.prompt-editor-host')).toBeVisible();

  const surfaceState = await collectWorkspaceSurfaceState(desktopWindow);
  await testInfo.attach('highlight-breadcrumb-surface-state', {
    body: JSON.stringify({ pageErrors, surfaceState }, null, 2),
    contentType: 'application/json'
  });

  expect(pageErrors).toEqual([]);
  expect(surfaceState.workspaceExists).toBe(true);
  expect(surfaceState.documentPanelExists).toBe(true);
});
