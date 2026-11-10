import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

for (const action of ['read', 'grade'] as const) {
  test(`moves a Dive in both directions and exits after ${action}`, async ({ desktopApp, desktopWindow: page }, testInfo) => {
    await expectWorkspaceShell(page);
    const id = await page.evaluate(async action => {
      window.localStorage.setItem('foliole-app-language', 'en');
      await window.__folioleWorkspaceDebug!.seedNodes([
        { id: 'conversion-folder', kind: 'folder', title: 'Conversion source', content: '' },
        { id: 'conversion-topic', kind: 'topic', title: 'Conversion Topic', content: 'Conversion reading body',
          parentNodeId: 'conversion-folder' },
        ...(action === 'grade' ? [{ id: 'conversion-card', kind: 'item' as const, title: 'Conversion Card',
          content: 'Conversion question', reveal: 'Conversion answer', parentNodeId: 'conversion-topic',
          review: { due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0 as const,
            stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 } }] : [])
      ], { persist: true });
      const { id } = await window.electronAPI.invoke('create_dive', { title: 'Conversion study', sourceIds: [] });
      await window.electronAPI.invoke('add_dive_sources', { diveId: id, sourceIds: ['conversion-folder', 'conversion-topic'] });
      return id;
    }, action);
    await resetDailyFlowGeneration(desktopApp);
    await page.reload();
    await expectWorkspaceShell(page);
    const section = page.getByRole('tree', { name: /^Dives?$/ });
    const row = page.getByRole('treeitem', { name: 'Conversion study', exact: true });
    const diveRow = section.getByRole('treeitem', { name: 'Conversion study', exact: true });
    const current = () => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId);
    const expectedCard = action === 'read' ? 'conversion-topic' : 'conversion-card';
    await diveRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Start Dive', exact: true }).click();
    await expect.poll(current).toBe(expectedCard);
    await diveRow.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Convert to Virtual Folder', exact: true }).click();
    await expect(diveRow).toHaveCount(0);
    await expect(row).toHaveCount(1);
    await expect.poll(current).toBe(expectedCard);

    if (action === 'grade') {
      await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
      await page.getByRole('button', { name: 'Good', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Read', exact: true }).click();
    }
    await expect(page.getByRole('group', { name: 'Flow toolbar' })).toHaveCount(0);
    await expect(page.getByText(action === 'read' ? 'Conversion reading body' : 'Conversion question', { exact: true })).toBeVisible();
    await testInfo.attach('after-conversion', { body: await page.screenshot(), contentType: 'image/png' });
    const result = await page.evaluate(async ({ id, expectedCard, action }) => {
      const { nodesById } = await window.electronAPI.invoke('load_workspace_snapshot', {});
      const node = nodesById[expectedCard];
      return { sources: nodesById[id]?.manualChildOrder, learned: action === 'read' ? node?.reading?.repetitionCount : node?.review?.reps };
    }, { id, expectedCard, action });
    expect(result).toEqual({ sources: ['conversion-folder', 'conversion-topic'], learned: 1 });

    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Convert to Dive', exact: true }).click();
    await expect(diveRow).toBeVisible();
    await expect(row).toHaveCount(1);
    await page.reload();
    await expectWorkspaceShell(page);
    await expect(diveRow).toBeVisible();
    await expect(row).toHaveCount(1);
  });
}

test('exits a converted empty Dive without opening global Flow', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    await window.electronAPI.invoke('create_dive', { title: 'Empty conversion', sourceIds: [] });
  });
  await page.reload();
  await expectWorkspaceShell(page);
  const dive = page.getByRole('tree', { name: /^Dives?$/ })
    .getByRole('treeitem', { name: 'Empty conversion', exact: true });
  await dive.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Start Dive', exact: true }).click();
  const toolbar = page.getByRole('group', { name: 'Flow toolbar' });
  await expect(toolbar).toBeVisible();
  await dive.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Convert to Virtual Folder', exact: true }).click();
  await expect(toolbar).toHaveCount(0);
  await expect(dive).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: 'Empty conversion', exact: true })).toHaveCount(1);
});
