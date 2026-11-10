import type { Page } from '@playwright/test';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const title = 'Trashable Dive';

async function seedDive(page: Page, empty: boolean) {
  return page.evaluate(async ({ title, empty }) => {
    window.localStorage.setItem('foliole-app-language', 'en');
    if (!empty) await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'dive-trash-folder', kind: 'folder', title: 'Referenced folder', content: '' },
      { id: 'dive-trash-topic', kind: 'topic', title: 'Referenced Topic', content: 'Referenced reading body',
        parentNodeId: 'dive-trash-folder' }
    ], { persist: true });
    const { id } = await window.electronAPI.invoke('create_dive', { title, sourceIds: [] });
    if (!empty) await window.electronAPI.invoke('add_dive_sources', {
      diveId: id, sourceIds: ['dive-trash-folder', 'dive-trash-topic']
    });
    return id;
  }, { title, empty });
}

function diveRow(page: Page) {
  return page.getByRole('tree', { name: /^Dives?$/ }).getByRole('treeitem', { name: title, exact: true });
}

async function startAndDeleteDive(page: Page) {
  const dive = diveRow(page);
  await dive.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Start Dive', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Flow toolbar' })).toBeVisible();
  await dive.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(dive).toHaveCount(0);
}

test('trashes and restores only the Dive while preserving the open Topic and its learning record', async ({ desktopApp, desktopWindow: page }, testInfo) => {
  await expectWorkspaceShell(page);
  const id = await seedDive(page, false);
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await startAndDeleteDive(page);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Flow toolbar' })).toHaveCount(0);
  await expect(page.getByText('Referenced reading body', { exact: true })).toBeVisible();
  const trash = page.getByRole('treeitem', { name: 'Trash', exact: true });
  const trashedDive = page.getByRole('tree', { name: 'Trash topics' })
    .getByRole('treeitem', { name: /^Trashable Dive(?: Root)?$/ });
  await trash.click();
  await expect(trashedDive).toBeVisible();
  await testInfo.attach('dive-in-trash', { body: await page.screenshot(), contentType: 'image/png' });
  await trashedDive.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Restore', exact: true }).click();
  await expect(diveRow(page)).toBeVisible();
  await page.reload();
  await expectWorkspaceShell(page);
  await expect(diveRow(page)).toBeVisible();
  const snapshot = () => page.evaluate(async id => {
    const state = await window.electronAPI.invoke('load_workspace_snapshot', {});
    const material = state.nodesById['dive-trash-topic'];
    return {
      references: state.nodesById[id]?.manualChildOrder,
      trashed: state.trashedNodeIds.filter(value => [id, 'dive-trash-topic', 'dive-trash-folder'].includes(value)),
      parent: material?.parentNodeId, repetitionCount: material?.reading?.repetitionCount
    };
  }, id);
  const material = { trashed: [], parent: 'dive-trash-folder', repetitionCount: 1 };
  expect(await snapshot()).toEqual({ ...material, references: ['dive-trash-folder', 'dive-trash-topic'] });

  await diveRow(page).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(diveRow(page)).toHaveCount(0);
  await trash.click();
  await trashedDive.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete Permanently', exact: true }).click();
  await expect.poll(snapshot).toEqual({ ...material, references: undefined });
});

test('deleting an empty Dive exits its review without opening global Flow', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await seedDive(page, true);
  await page.reload();
  await expectWorkspaceShell(page);
  await startAndDeleteDive(page);
  await expect(page.getByRole('group', { name: 'Flow toolbar' })).toHaveCount(0);
});
