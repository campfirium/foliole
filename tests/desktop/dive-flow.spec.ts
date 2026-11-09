import fs from 'node:fs';
import path from 'node:path';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

for (const kind of ['topic', 'item'] as const) {
  test(`handles a Dive ${kind} and resumes the original global Flow card`, async ({ desktopApp, desktopWindow: page }) => {
    await expectWorkspaceShell(page);
    await seedDiveCards(page, kind);
    await resetDailyFlowGeneration(desktopApp);
    await page.reload();
    await expectWorkspaceShell(page);
    await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());

    const dives = page.getByRole('tree', { name: 'Dives', exact: true });
    await dives.getByRole('treeitem', { name: 'Dives', exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Create Dive' }).click();
    const input = page.getByRole('textbox', { name: 'Rename Untitled Dive' });
    await input.fill('Focused study');
    await input.press('Enter');
    if (kind === 'topic') {
      await dives.getByRole('treeitem', { name: 'Dives', exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Create Dive' }).click();
      const empty = page.getByRole('textbox', { name: 'Rename Untitled Dive' });
      await empty.fill('Empty study');
      await empty.press('Enter');
    }
    const renamedDive = await verifyDiveBrowsing(page, dives);

    const current = () => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId);
    await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
    await expect.poll(current).toBe('global-first');
    await expect(renamedDive).toHaveAttribute('aria-selected', 'false');
    await renamedDive.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Start Dive', exact: true }).click();

    const id = kind === 'topic' ? 'dive-topic' : 'dive-item';
    await expect.poll(current).toBe(id);
    await expectDiveScope(page, renamedDive, kind);
    const output = path.resolve('.tmp/artifacts/T745-0-4');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `${kind}-in-dive.png`) });
    if (kind === 'item') {
      await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
      await page.getByRole('button', { name: 'Good', exact: true }).click();
    } else {
      await addSource(page, 'Late source', 'Renamed study');
      await expect.poll(current).toBe(id);
      await page.getByRole('button', { name: 'Read', exact: true }).click();
      await expect.poll(current).toBe('late-source');
      await page.getByRole('button', { name: 'Read', exact: true }).click();
    }
    await expect.poll(current).toBeNull();
    await expect(page.getByRole('heading', { name: 'Dive Queue Clear' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (kind === 'topic') await finishDiveRounds(page, output);
    await page.getByRole('group', { name: 'Flow toolbar' }).getByRole('button', { name: 'Global', exact: true }).click();
    await expect.poll(current).toBe('global-first');
    await expect(page.getByRole('complementary', { name: 'Inspector' }).getByText('Library', { exact: true })).toBeVisible();

    const learned = await page.evaluate(async ({ id, kind }) => {
      const node = (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById[id];
      return kind === 'topic' ? node?.reading?.repetitionCount : node?.review?.reps;
    }, { id, kind });
    expect(learned).toBe(1);
    const global = await page.evaluate(async () =>
      (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById['global-first']);
    expect(global?.review?.reps ?? global?.reading?.repetitionCount ?? 0).toBe(0);
    if (kind === 'item') await expectExitDive(page, renamedDive);
  });
}

async function expectExitDive(page: import('@playwright/test').Page, dive: import('@playwright/test').Locator) {
  await dive.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Start Dive', exact: true }).click();
  const toolbar = page.getByRole('group', { name: 'Flow toolbar' });
  await toolbar.getByRole('button', { name: 'Exit', exact: true }).click();
  await expect(toolbar).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enter Flow', exact: true })).toBeVisible();
}

async function expectDiveScope(page: import('@playwright/test').Page, dive: import('@playwright/test').Locator, kind: 'topic' | 'item') {
  await expect(dive).toHaveAttribute('aria-selected', 'true');
  const panel = page.getByRole('complementary', { name: 'Current folder contents' });
  await expect(panel.getByRole('treeitem', { name: kind === 'item' ? /Dive item/ : /Dive topic/ })).toBeVisible();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByText('Renamed study', { exact: true })).toBeVisible();
  const queue = inspector.getByRole('list', { name: 'Flow items' });
  await expect(queue.getByRole('button', { name: kind === 'item' ? 'Dive item' : 'Dive topic' })).toBeVisible();
  await expect(queue.getByRole('button', { name: 'Global first' })).toHaveCount(0);
}

async function verifyDiveBrowsing(page: import('@playwright/test').Page, dives: import('@playwright/test').Locator) {
  const diveRow = dives.getByRole('treeitem', { name: 'Focused study', exact: true });
  const source = dives.getByRole('treeitem', { name: 'Dive source', exact: true });
  await expect(source).toHaveCount(0);
  await diveRow.click();
  await addSource(page, 'Dive source');
  await expect(page.getByRole('dialog', { name: 'Add to Dive' })).toBeHidden();
  expect(await source.isVisible()).toBe(true);
  await expect(page.getByRole('treeitem', { name: 'Dive topic', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Dive', exact: true })).toHaveCount(0);

  await diveRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const rename = page.getByRole('textbox', { name: 'Rename Focused study' });
  await rename.fill('Renamed study');
  await rename.press('Enter');
  const renamedDive = dives.getByRole('treeitem', { name: 'Renamed study', exact: true });
  await expect(rename).toBeHidden();
  expect(await renamedDive.getAttribute('aria-selected', { timeout: 200 })).toBe('true');
  await expect(source).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Dive topic', exact: true })).toBeVisible();
  const output = path.resolve('.tmp/artifacts/T747-dive');
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'dive-browsing.png') });
  await page.reload();
  await expectWorkspaceShell(page);
  await expect(source).toBeVisible();
  return renamedDive;
}

async function addSource(page: import('@playwright/test').Page, title: string, dive = 'Focused study') {
  await page.getByRole('treeitem', { name: title, exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to Dive…' }).click();
  await page.getByRole('dialog', { name: 'Add to Dive' }).getByRole('button', { name: dive, exact: true }).click();
}

async function finishDiveRounds(page: import('@playwright/test').Page, output: string) {
  const toolbar = page.getByRole('group', { name: 'Flow toolbar' });
  await toolbar.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dive Clear for Now' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'All clear for now.' })).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No Unread Material in This Dive' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'All clear for now.' })).toHaveCount(0);
  await page.screenshot({ path: path.join(output, 'topics-choice.png') });
  await toolbar.getByRole('button', { name: 'Switch', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Empty study' }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().dive?.phase)).toBe('initial');
  await expect(page.getByRole('heading', { name: 'Dive Queue Clear' })).toBeVisible();
}

async function seedDiveCards(page: import('@playwright/test').Page, kind: 'topic' | 'item') {
  await page.evaluate(async kind => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const workspace = window.__folioleWorkspaceDebug!;
    const existing = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(existing.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await workspace.deleteNode(node.id);
    }
    const review = { due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0 as const,
      stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 };
    await workspace.seedNodes([
      { id: 'global-first', kind, title: 'Global first', content: 'Global first body', priority: 0,
        ...(kind === 'item' ? { reveal: 'Global answer', review } : {}) },
      { id: 'dive-source', kind: 'folder', title: 'Dive source', content: '' },
      { id: 'dive-topic', kind: 'topic', title: 'Dive topic', parentNodeId: 'dive-source',
        content: kind === 'topic' ? 'Dive reading body' : '' },
      ...(kind === 'item' ? [{ id: 'dive-item', kind: 'item' as const, title: 'Dive item',
        parentNodeId: 'dive-topic', content: 'Dive question', reveal: 'Dive answer', review }] :
        [{ id: 'late-folder', kind: 'folder' as const, title: 'Late source', content: '' },
          { id: 'late-source', kind: 'topic' as const, title: 'Late topic', parentNodeId: 'late-folder', content: 'Added during study' }])
    ], { persist: true });
  }, kind);
}
