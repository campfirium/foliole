import fs from 'node:fs';
import path from 'node:path';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

for (const kind of ['topic', 'item'] as const) {
  test(`handles a Dive ${kind} and resumes the original global Flow card`, async ({ desktopApp, desktopWindow: page }) => {
    await expectWorkspaceShell(page);
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
          parentNodeId: 'dive-topic', content: 'Dive question', reveal: 'Dive answer', review }] : [])
      ], { persist: true });
    }, kind);
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
    await page.getByRole('treeitem', { name: 'Dive source', exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add to Dive…' }).click();
    await page.getByRole('dialog', { name: 'Add to Dive' }).getByRole('button', { name: 'Focused study' }).click();

    const current = () => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId);
    await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
    await expect.poll(current).toBe('global-first');
    await dives.getByRole('treeitem', { name: 'Focused study' }).click();
    await page.getByRole('button', { name: 'Start Dive', exact: true }).click();

    const id = kind === 'topic' ? 'dive-topic' : 'dive-item';
    await expect.poll(current).toBe(id);
    const output = path.resolve('.tmp/artifacts/T745-0-2');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `${kind}-in-dive.png`) });
    if (kind === 'item') {
      await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
      await page.getByRole('button', { name: 'Good', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Read', exact: true }).click();
    }
    await expect.poll(current).toBeNull();
    await page.getByRole('button', { name: 'Return to Flow', exact: true }).click();
    await expect.poll(current).toBe('global-first');

    const learned = await page.evaluate(async ({ id, kind }) => {
      const node = (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById[id];
      return kind === 'topic' ? node?.reading?.repetitionCount : node?.review?.reps;
    }, { id, kind });
    expect(learned).toBe(1);
  });
}
