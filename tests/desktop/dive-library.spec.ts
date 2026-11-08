import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('creates a Dive, adds a folder and browses its topics after reload', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'dive-source-folder', kind: 'folder', title: 'Reference shelf', content: '' },
      { id: 'dive-member', kind: 'topic', title: 'Statistics primer',
        parentNodeId: 'dive-source-folder', content: 'Readable body' }
    ], { persist: true });
  });
  await page.reload();
  await expectWorkspaceShell(page);

  const dives = page.getByRole('tree', { name: 'Dives', exact: true });
  await dives.getByRole('treeitem', { name: 'Dives', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Create Dive' }).click();
  const input = page.getByRole('textbox', { name: 'Rename Untitled Dive' });
  await input.fill('Probability');
  await input.press('Enter');
  const dive = dives.getByRole('treeitem', { name: 'Probability' });
  await expect(dive).toBeVisible();
  await expect(page.getByText('No topics in this Dive')).toBeVisible();

  await page.getByRole('treeitem', { name: 'Reference shelf', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to Dive…' }).click();
  await page.getByRole('dialog', { name: 'Add to Dive' }).getByRole('button', { name: 'Probability' }).click();
  await expect(dives.getByRole('treeitem', { name: 'Reference shelf' })).toBeVisible();

  await page.reload();
  await expectWorkspaceShell(page);
  await dive.click();
  await expect(dives.getByRole('treeitem', { name: 'Reference shelf' })).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'Current folder contents' });
  await expect(panel.getByRole('treeitem', { name: 'Statistics primer' })).toBeVisible();
  const output = path.resolve('.tmp/artifacts/T745-0-1');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'desktop-dive.png') });
});
