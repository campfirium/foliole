import type { Page } from '@playwright/test';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const TOPICS = ['resume-flow-first', 'resume-flow-second'];

async function seedFlowArticles(page: Page) {
  await page.evaluate(async ids => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const workspace = window.__folioleWorkspaceDebug!;
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await workspace.deleteNode(node.id);
    }
    await workspace.seedNodes(ids.map(id => ({
      id,
      kind: 'topic',
      title: id,
      content: ['# Reading sample', ...Array.from({ length: 320 }, (_, index) =>
        index === 200 ? '## Far section' : `Paragraph ${index + 1} of a scrollable article.`
      )].join('\n\n')
    })), { persist: true });
  }, TOPICS);
}

test('Read persists the latest position before moving Flow to the next article', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await seedFlowArticles(page);
  await expect(() => resetDailyFlowGeneration(desktopApp)).toPass({ timeout: 5000 });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  const read = page.getByRole('button', { name: 'Read', exact: true });
  await expect(read).toBeEnabled();
  const nodeId = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId);
  expect(TOPICS).toContain(nodeId);

  const scroller = page.locator('.prompt-editor-host .cm-scroller');
  await scroller.hover();
  await page.mouse.wheel(0, 2600);
  await scroller.evaluate(element => new Promise<void>(resolve => {
    if (element.scrollTop > 0) resolve();
    else element.addEventListener('scroll', () => resolve(), { once: true });
  }));
  await read.click();

  await expect.poll(() => page.evaluate(() =>
    window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId
  )).toBe(TOPICS.find(id => id !== nodeId));
  const saved = await page.evaluate(id =>
    window.electronAPI.invoke('load_reading_resume', { nodeId: id! }), nodeId
  );
  expect(saved?.offset).toBeGreaterThan(0);
});

test('saves a position after stopping at a heading from the outline', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await seedFlowArticles(page);
  await page.reload();
  await expectWorkspaceShell(page);
  const nodeId = TOPICS[0]!;
  await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), nodeId);
  await expect.poll(() => page.evaluate(() =>
    window.__folioleDebug?.getEditorContent('prompt-editor')?.includes('## Far section')
  )).toBe(true);
  const outline = page.locator('[data-panel-content-root="outline"]');
  const toggle = page.locator('[data-workspace-sidebar-toggle="right"]:visible').first();
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
  if (!await outline.isVisible()) await page.getByRole('button', { name: 'Outline panel', exact: true }).click();
  await outline.getByRole('button', { name: 'Far section', exact: true }).click({ timeout: 5000 });
  await expect.poll(() => page.evaluate(async id =>
    (await window.electronAPI.invoke('load_reading_resume', { nodeId: id }))?.offset ?? 0, nodeId
  )).toBeGreaterThan(5000);
});
