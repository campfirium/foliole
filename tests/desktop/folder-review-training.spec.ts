import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { trainingEvents } from '../../lib/core/review/trainingFixture.testSupport';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

async function seedTrainingWorkspace(page: Page, app: ElectronApplication) {
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const events = trainingEvents();
  const ids = [...new Set(events.map(event => event.nodeId))];
  await page.evaluate(async nodeIds => {
    await window.__folioleWorkspaceDebug!.seedNodes([
      { id: 'folder', kind: 'folder', title: 'Training folder', content: '' },
      ...nodeIds.map(id => ({ id, kind: 'item' as const, parentNodeId: 'folder', title: `Question ${id}`,
        content: 'Question', reveal: 'Answer' }))
    ], { persist: true });
    await window.__folioleWorkspaceDebug!.openNode('folder');
  }, ids);
  await app.evaluate(({ app }, rows) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const connection = require(`${app.getAppPath()}/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      driver.transaction(() => {
        for (const row of rows) driver.execute(`INSERT INTO review_log
          (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind, voids_op_id)
          VALUES (?, ?, 'fixture', ?, ?, '', ?, 'review', NULL)`,
        [row.opId, row.opId, row.nodeId, row.grade, row.reviewedAt]);
      });
    });
  }, events);
}

function readTrainingState(app: ElectronApplication) {
  return app.evaluate(({ app }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const connection = require(`${app.getAppPath()}/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      return { states: driver.queryAll('SELECT * FROM node_review ORDER BY node_id'),
        models: driver.queryAll("SELECT value_json FROM setting_records WHERE key LIKE 'review_training/%'")
          .map((row: { value_json: string }) => JSON.parse(row.value_json)) };
    });
  });
}

function readTrainedGrade(app: ElectronApplication) {
  return app.evaluate(({ app }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${app.getAppPath()}/main.js`);
    const connection = require(`${app.getAppPath()}/database/connection.js`);
    const { recomputeReview } = require(`${app.getAppPath()}/../lib/core/review/recomputeReview.js`);
    const { readNodeReviewParameters } = require(`${app.getAppPath()}/../lib/core/database/reviewProjection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const graded = driver.queryOne("SELECT node_id FROM review_log WHERE host_name != 'fixture' AND kind='review' ORDER BY reviewed_at DESC LIMIT 1");
      if (!graded) return null;
      const events = driver.queryAll('SELECT * FROM review_log WHERE node_id = ?', [graded.node_id]);
      const parameters = readNodeReviewParameters(driver, graded.node_id);
      const actual = driver.queryOne('SELECT stability, difficulty, scheduled_days FROM node_review WHERE node_id = ?', [graded.node_id]);
      const expected = recomputeReview(events, parameters);
      const defaults = recomputeReview(events, { ...parameters, weights: undefined });
      return { actual, expected, defaults };
    });
  });
}

test('automatically trains folder history, reports it without controls, and uses parameters on the next grade', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await seedTrainingWorkspace(page, desktopApp);
  const before = await readTrainingState(desktopApp);
  const settings = await openSettingsCategory(page, 'Review');
  await expect(settings.getByText(/^Recent training: Training folder/)).toBeVisible({ timeout: 60000 });
  await expect(settings.getByRole('button', { name: 'Optimize now', exact: true })).toHaveCount(0);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T505/folder-review-idle-training.png') });
  const optimized = await readTrainingState(desktopApp);
  expect(optimized.states).toEqual(before.states);
  expect(optimized.models).toHaveLength(2);
  expect(optimized.models.find((model: { folderId: string | null }) => model.folderId === null).enabled).toBe(true);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: /^Good$/ }).click();
  const observed = { grade: null as Awaited<ReturnType<typeof readTrainedGrade>> };
  await expect.poll(async () => {
    observed.grade = await readTrainedGrade(desktopApp);
    return observed.grade;
  }).not.toBeNull();
  const check = observed.grade;
  expect(check).not.toBeNull();
  expect(check!.actual).toEqual({ stability: check!.expected.stability, difficulty: check!.expected.difficulty,
    scheduled_days: check!.expected.scheduled_days });
  expect(check!.expected).not.toEqual(check!.defaults);
});
