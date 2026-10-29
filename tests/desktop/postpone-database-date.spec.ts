import path from 'node:path';

import { runPaletteHistoryCommand } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('previews the database natural due date and preserves its reading facts through postpone history', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  const before = await page.evaluate(async () => {
    await window.__folioleWorkspaceDebug!.seedNodes([{ id: 'postpone-database', kind: 'topic',
      title: 'Database postpone', content: 'Postpone database body' }], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode('postpone-database');
    const at = new Date().toISOString();
    const reading = { intervalDurationMs: 1209600000, intervalGrowthFactor: 1.7, lastHandledAt: at, nextAt: at,
      priority: 3, readingPosition: 0, repetitionCount: 9, state: 'active' as const };
    await window.electronAPI.invoke('save_node_reading_state', { nodeId: 'postpone-database', reading, updatedAt: at });
    const due = new Date(Date.parse(at) + reading.intervalDurationMs);
    return { reading, due: due.toISOString(), label: new Intl.DateTimeFormat(undefined,
      { day: 'numeric', month: 'short', year: 'numeric' }).format(due) };
  });
  await page.locator('[data-node-id="postpone-database"]').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Postpone topic...', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Postpone Topic' });
  await dialog.getByRole('slider').press('Home');
  await expect(dialog.getByText(before.label, { exact: true })).toBeVisible();
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T632/postpone-database-date.png') });
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(dialog).toBeHidden();
  const facts = () => page.evaluate(async () => (await window.electronAPI.invoke('load_workspace_snapshot', {}))
    .nodesById['postpone-database']?.reading);
  expect(await facts()).toEqual({ ...before.reading, nextAt: before.due });
  await runPaletteHistoryCommand(page, 'Undo Postpone Topic');
  await expect.poll(facts).toEqual(before.reading);
  await runPaletteHistoryCommand(page, 'Redo Postpone Topic');
  await expect.poll(facts).toEqual({ ...before.reading, nextAt: before.due });
  await page.reload();
  await expectWorkspaceShell(page);
  expect(await facts()).toEqual({ ...before.reading, nextAt: before.due });
});
