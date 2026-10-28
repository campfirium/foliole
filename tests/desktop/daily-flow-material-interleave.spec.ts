import fs from 'node:fs';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

function readDailyOrder(app: ElectronApplication) {
  return app.evaluate(({ app }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const connection = require(`${app.getAppPath()}/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver
      .queryAll('SELECT node_id FROM daily_flow_entries ORDER BY order_key')
      .map((row: { node_id: string }) => row.node_id)) as string[];
  });
}

test('interleaves all daily source cards and keeps that order after grading and reload', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    const nodes = [10, 5, 4, 3].flatMap((count, source) => [
      { id: `source-${source}`, kind: 'folder' as const, title: `Source ${source}`, content: '', priority: 5 },
      ...Array.from({ length: count }, (_, index) => {
        const id = `${source}-${String(index).padStart(2, '0')}`;
        return { id, parentNodeId: `source-${source}`, kind: 'item' as const, title: id,
          content: `Question ${id}`, reveal: `Answer ${id}`, priority: 5,
          review: { due: '2026-04-08T00:00:00.000Z', lastReviewAt: '2026-04-07T00:00:00.000Z', state: 2,
            stability: 1, difficulty: 1, elapsedDays: 1, scheduledDays: 1, reps: 2, lapses: 0 } };
      })
    ]);
    await window.__folioleWorkspaceDebug!.seedNodes(nodes, { persist: true });
  });
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await page.getByRole('button', { name: /^(Change session mode|Session mode:)/ }).click();
  await page.getByRole('menuitem', { name: /Review first/ }).click();
  await page.getByRole('button', { name: /^Exit Flow$/ }).click();
  const beforeGeneration = await desktopApp.evaluate(({ app }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const connection = require(`${app.getAppPath()}/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const priorRows = driver.queryAll('SELECT node_id FROM daily_flow_entries ORDER BY order_key');
      const nodes = driver.queryAll("SELECT id,parent_id,kind FROM nodes WHERE id GLOB '[0-3]-*'");
      driver.transaction(() => {
        for (const table of ['daily_flow_entries', 'daily_flow_state', 'daily_flow_operations']) driver.execute(`DELETE FROM ${table}`);
      });
      return { priorRows, nodes };
    });
  });
  fs.mkdirSync('.tmp/artifacts/T441/dispersion', { recursive: true });
  fs.writeFileSync('.tmp/artifacts/T441/dispersion/native-input.json', JSON.stringify(beforeGeneration, null, 2));
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toMatch(/^[0-3]-\d\d$/);
  const order = (await readDailyOrder(desktopApp)).filter(id => /^[0-3]-\d\d$/.test(id));
  fs.writeFileSync('.tmp/artifacts/T441/dispersion/native-order.json', JSON.stringify(order));
  expect(new Set(order).size).toBe(22);
  expect(order.every((id, index) => index === 0 || id[0] !== order[index - 1]![0])).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(order[0]);
  await expect(page.getByText(`Question ${order[0]}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  for (const name of ['Again', 'Hard', 'Good', 'Easy']) await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(order[1]);
  const savedOrder = await readDailyOrder(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(order[1]);
  expect(await readDailyOrder(desktopApp)).toEqual(savedOrder);
});
