import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function verifyTopicReviewOptions(page: Page, options: Locator) {
  await page.locator('[data-node-id="enforcing-topic"]').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Review options…', exact: true }).click();
  const slider = options.getByRole('slider', { name: 'Review queue priority' });
  const effective = options.getByRole('button', { name: 'Effective priority P3' });
  await expect(slider).toHaveValue('7');
  await expect(effective).toBeVisible();
  await slider.press('ArrowLeft');
  await expect(slider).toHaveValue('6');
  await expect(effective).toBeVisible();
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T882/review-options.png') });
  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();
}

test('enforces a folder priority while keeping the material value editable and durable', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    const workspace = window.__folioleWorkspaceDebug!;
    await workspace.seedNodes([
      { id: 'enforcing-folder', kind: 'folder', title: 'English', content: '', priority: 3 },
      { id: 'enforcing-topic', kind: 'topic', parentNodeId: 'enforcing-folder', title: 'Words', content: 'Study words', priority: 9 }
    ], { persist: true });
    await workspace.openNode('enforcing-topic');
  });
  await page.getByRole('treeitem', { name: 'English', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Review options…', exact: true }).click();
  const options = page.getByRole('dialog', { name: 'Review options' });
  await options.getByRole('switch', { name: 'Enforce Priority' }).check();
  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();
  await page.getByRole('button', { name: 'Scheduling panel', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByText('P3', { exact: true })).toBeVisible();
  await expect(inspector.getByText('P9', { exact: true })).toBeVisible();

  await page.keyboard.press('Control+M');
  const quick = page.getByRole('dialog', { name: 'Set priority' });
  await expect(quick.getByText('(Enforced)', { exact: true })).toBeVisible();
  await expect(quick.getByRole('slider')).toHaveValue('9');
  await expect(quick.getByRole('slider')).toBeEnabled();
  await expect(quick.getByRole('button', { name: 'Effective priority P3' })).toBeVisible();
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T882/enforced-priority.png') });
  await page.keyboard.press('7');
  await expect(quick).toBeHidden();
  await expect(inspector.getByText('P3', { exact: true })).toBeVisible();
  await verifyTopicReviewOptions(page, options);
  await expect(inspector.getByText('P3', { exact: true })).toBeVisible();

  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('enforcing-topic'));
  if (!await inspector.getByRole('button', { name: 'Source', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Scheduling panel', exact: true }).click();
  }
  await expect(inspector.getByText('P6', { exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Source', exact: true }).click();
  await page.getByRole('tooltip').getByRole('button', { name: 'English', exact: true }).click();
  const enforcing = page.getByRole('dialog', { name: 'Review options · English' });
  await expect(enforcing.getByRole('switch', { name: 'Enforce Priority' })).toBeChecked();
  await enforcing.getByRole('switch', { name: 'Enforce Priority' }).uncheck();
  await page.keyboard.press('Escape');
  await expect(inspector.getByText('P6', { exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Source', exact: true })).toBeHidden();
});
