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
    const workspace = document.querySelector('main');
    const breadcrumbs = document.querySelector('nav[aria-label="面包屑"], nav[aria-label="Node breadcrumbs"]');
    const documentPanel = document.querySelector('[aria-label="文档面板"], [aria-label="Document panel"]');
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

  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
    .toBe('playwright-highlight-child');
  const breadcrumbs = desktopWindow.getByRole('navigation', { name: /^(Node breadcrumbs|面包屑)$/ });
  await expect(breadcrumbs).toBeVisible();
  await breadcrumbs.getByRole('button', { name: 'Playwright Parent' }).click();

  const afterClickState = await collectWorkspaceSurfaceState(desktopWindow);
  console.log('highlight-breadcrumb-after-click', JSON.stringify({ afterClickState, pageErrors }));
  await testInfo.attach('highlight-breadcrumb-after-click', {
    body: JSON.stringify({ afterClickState, pageErrors }, null, 2),
    contentType: 'application/json'
  });

  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
    .toBe('playwright-parent-topic');
  await expect(desktopWindow.locator('.prompt-editor-host')).toBeVisible();
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toContainText('Alpha Beta Gamma');

  const surfaceState = await collectWorkspaceSurfaceState(desktopWindow);
  await testInfo.attach('highlight-breadcrumb-surface-state', {
    body: JSON.stringify({ pageErrors, surfaceState }, null, 2),
    contentType: 'application/json'
  });

  expect(pageErrors).toEqual([]);
  expect(surfaceState.workspaceExists).toBe(true);
  expect(surfaceState.documentPanelExists).toBe(true);
});

test('new topic body survives creating a highlight and opening its child', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  const parentId = await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  expect(parentId).toBeTruthy();

  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await editor.click();
  await desktopWindow.keyboard.insertText('Alpha Beta Gamma');
  await expect(editor).toContainText('Alpha Beta Gamma');
  await expect.poll(() => desktopWindow.evaluate(() =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', 6, 10) ?? false
  )).toBe(true);
  await editor.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, button: 0, clientX: rect.left + 120, clientY: rect.top + 20
    }));
  });
  await desktopWindow.locator('[data-annotation-toolbar="true"]')
    .getByRole('button', { name: /^(Highlight|高亮)$/ }).click();

  const childId = await desktopWindow.evaluate((id) => {
    const api = window.__folioleWorkspaceDebug;
    return api?.listNodes?.().map((node) => api.getNode?.(node.id))
      .find((node) => node?.parentNodeId === id && node.anchorLink?.kind === 'highlight')?.id ?? null;
  }, parentId);
  expect(childId).toBeTruthy();
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${childId}"]`).click();
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
    .toBe(childId);
  await desktopWindow.getByRole('navigation', { name: /^(Node breadcrumbs|面包屑)$/ })
    .getByRole('button', { name: /Alpha Beta Gamma/ }).click();
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
    .toBe(parentId);
  await expect(editor).toContainText('Alpha Beta Gamma');
  const navigationFlow = await desktopWindow.evaluate(() => window.__foliolePerformanceDebug?.getSnapshot?.().flow);
  console.log('new-topic-parent-navigation-flow', JSON.stringify(navigationFlow));
  await testInfo.attach('parent-navigation-flow', {
    body: JSON.stringify(navigationFlow, null, 2),
    contentType: 'application/json'
  });
  await desktopWindow.screenshot({ path: testInfo.outputPath('new-topic-parent-reopened.png') });
});

test('a topic first loaded empty keeps its edited body after visiting a highlight child', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const parentId = 'playwright-initially-empty-parent';
  await desktopWindow.evaluate(async (id) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { content: '', id, kind: 'topic', title: 'Initially Empty Parent' }
    ], { persist: true });
    await window.__folioleWorkspaceDebug?.openNode?.(id);
  }, parentId);
  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await editor.click();
  await desktopWindow.keyboard.insertText('Alpha Beta Gamma');
  await expect(editor).toContainText('Alpha Beta Gamma');
  await expect.poll(() => desktopWindow.evaluate(() =>
    window.__folioleDebug?.setEditorSelection?.('prompt-editor', 6, 10) ?? false
  )).toBe(true);
  await editor.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true, button: 0, clientX: rect.left + 120, clientY: rect.top + 20
    }));
  });
  await desktopWindow.locator('[data-annotation-toolbar="true"]')
    .getByRole('button', { name: /^(Highlight|高亮)$/ }).click();
  const childId = await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.listNodes?.()
    .map((node) => window.__folioleWorkspaceDebug?.getNode?.(node.id))
    .find((node) => node?.parentNodeId === id && node.anchorLink?.kind === 'highlight')?.id ?? null, parentId);
  expect(childId).toBeTruthy();
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${childId}"]`).click();
  await desktopWindow.getByRole('navigation', { name: /^(Node breadcrumbs|面包屑)$/ })
    .getByRole('button', { name: 'Initially Empty Parent' }).click();
  await expect(editor).toContainText('Alpha Beta Gamma');
  await desktopWindow.screenshot({ path: testInfo.outputPath('initially-empty-parent-reopened.png') });
});
