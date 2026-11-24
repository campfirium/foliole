import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('shows the effective priority source and opens its review options', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async () => {
    const workspace = window.__folioleWorkspaceDebug!;
    await workspace.seedNodes([
      { id: 'source-folder', kind: 'folder', title: 'English', content: '', priority: 2 },
      { id: 'source-inherited', kind: 'topic', parentNodeId: 'source-folder', title: 'Inherited topic', content: 'Inherited priority' },
      { id: 'source-own', kind: 'topic', parentNodeId: 'source-folder', title: 'Own topic', content: 'Own priority', priority: 9 },
      { id: 'source-default', kind: 'topic', title: 'Default topic', content: 'Default priority' }
    ], { persist: true });
    await workspace.openNode('source-inherited');
  });
  await page.getByRole('button', { name: 'Scheduling panel', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByText('P2', { exact: true })).toBeVisible();
  await expect(inspector.getByText('(Inherited)', { exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'English', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review options · English' });
  const priority = dialog.getByRole('slider', { name: 'Review queue priority' });
  await expect(priority).toHaveValue('2');
  await priority.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(inspector.getByText('P3', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T859/priority-source.png') });
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('source-own'));
  await expect(inspector.getByText('Own', { exact: true })).toBeVisible();
  await expect(inspector.getByText('P9', { exact: true })).toBeVisible();
  await page.evaluate(() => window.__folioleWorkspaceDebug!.openNode('source-default'));
  await expect(inspector.getByText('Default', { exact: true })).toBeVisible();
});
