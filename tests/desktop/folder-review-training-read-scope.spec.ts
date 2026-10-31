import fs from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { trainingEvents } from '../../lib/core/review/trainingFixture.testSupport';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test, normalizeDesktopWindow, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

async function seedTrainingWorkspace(page: Page, app: ElectronApplication) {
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  const events = trainingEvents(1023);
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
    const { recomputeNodeReview } = require(`${app.getAppPath()}/../lib/core/database/reviewProjection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      driver.transaction(() => {
        for (const row of rows) driver.execute(`INSERT INTO review_log
          (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind, voids_op_id)
          VALUES (?, ?, 'fixture', ?, ?, '', ?, 'review', NULL)`,
        [row.opId, row.opId, row.nodeId, row.grade, row.reviewedAt]);
        for (const id of new Set(rows.map(row => row.nodeId))) recomputeNodeReview(driver, id);
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
      return { databases: driver.queryAll('PRAGMA database_list'),
        states: driver.queryAll('SELECT * FROM node_review ORDER BY node_id'),
        facts: driver.queryAll('SELECT * FROM review_log ORDER BY op_id'),
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
      return { nodeId: graded.node_id, actual, expected, defaults, parameters };
    });
  });
}

const output = path.resolve('.tmp/artifacts/T673-8/mac-training');
function save(name: string, value: unknown) {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(`${output}/${name}.json`, JSON.stringify(value, null, 2));
}

async function capture(session: DesktopSession) {
  const page = session.firstWindow;
  const identity = await session.electronApp.evaluate(({ app, BrowserWindow }) => ({
    pid: process.pid, argv: process.argv, appPath: app.getAppPath(), userData: app.getPath('userData'),
    boot: process.env.FOLIOLE_BOOT_SESSION ?? null,
    windows: BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(),
      visible: window.isVisible(), focusable: window.isFocusable(), bounds: window.getBounds(),
      opacity: window.getOpacity(), offscreen: window.webContents.isOffscreen() }))
  }));
  const documents = await page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    const ids = Object.values(snapshot.nodesById).filter(node => node.parentNodeId === 'folder').map(node => node.id);
    return { visibility: document.visibilityState, focused: document.hasFocus(),
      documents: await Promise.all(ids.map(nodeId => window.electronAPI.invoke('load_node_document', { nodeId }))) };
  });
  return { identity, ...documents, ...await readTrainingState(session.electronApp) };
}

async function enterReview(page: Page) {
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  const mode = page.getByRole('button', { name: /^(Change session mode|Session mode:)/ });
  const answer = page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ });
  await expect(mode.or(answer)).toBeVisible();
  if (await mode.isVisible()) {
    await mode.click();
    await page.getByRole('menuitem', { name: /Review first/ }).click();
  }
}

async function grade(page: Page, app: ElectronApplication, count: number) {
  await expect(page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ })).toBeVisible();
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await page.getByRole('button', { name: /^Good$/ }).click();
  await expect.poll(async () => (await readTrainingState(app)).facts.length).toBe(count);
}

async function restart(session: DesktopSession) {
  const oldPid = session.electronApp.process().pid;
  const closed = session.electronApp.waitForEvent('close');
  await session.electronApp.evaluate(({ app }) => { setImmediate(() => app.quit()); });
  await closed;
  expect(() => process.kill(oldPid!, 0)).toThrow();
  save('quit', { oldPid, normalAppQuit: true, oldProcessGone: true });
  // The fixture releases the original isolation only after the same-library restart.
  const next = await launchDesktopSession({ env: { ...session.launchOptions.env,
    FOLIOLE_BOOT_SESSION: 't673-8-mac-training-restart-1' } }) as DesktopSession;
  await normalizeDesktopWindow(next);
  return next;
}

async function verifyRestart(session: DesktopSession) {
  const beforeRestart = await capture(session);
  save('before-restart', beforeRestart);
  const next = await restart(session);
  try {
    await expectWorkspaceShell(next.firstWindow);
    await next.firstWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
    const restored = await capture(next);
    save('restored', restored);
    expect(restored.identity.pid).not.toBe(beforeRestart.identity.pid);
    expect(restored.identity.userData).toBe(beforeRestart.identity.userData);
    expect(restored.models).toEqual(beforeRestart.models);
    expect(restored.facts).toEqual(beforeRestart.facts);
    expect(restored.states).toEqual(beforeRestart.states);
    expect(restored.documents).toEqual(beforeRestart.documents);
    await next.firstWindow.screenshot({ path: `${output}/restored.png` });
    save('result', { passed: true, threshold: 1024, factsAfterGrade: 1025,
      beforePid: beforeRestart.identity.pid, afterPid: restored.identity.pid });
  } finally { await next.close(); }
}

test('automatically trains after a real threshold grade and retains trained grading through a full restart', async ({ desktopSession }) => {
  const { electronApp: app, firstWindow: page } = desktopSession;
  await expectWorkspaceShell(page);
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await seedTrainingWorkspace(page, app);
  // Initial fixture only: replace the tutorial list before the first learning action.
  await resetDailyFlowGeneration(app);
  await page.reload();
  await expectWorkspaceShell(page);
  await enterReview(page);
  const initial = await capture(desktopSession);
  save('initial', initial);
  expect(initial.facts).toHaveLength(1023);
  expect(initial.models).toHaveLength(0);
  await grade(page, app, 1024);
  await page.getByRole('button', { name: /^Exit Flow$/ }).click();
  const before = await capture(desktopSession);
  save('threshold', before);
  expect(before.models).toHaveLength(0);
  expect(before.visibility).toBe('visible');
  const settings = await openSettingsCategory(page, 'Review');
  const idleStarted = Date.now();
  save('idle-start', { at: idleStarted, visibility: await page.evaluate(() => document.visibilityState) });
  await expect(settings.getByRole('button', { name: 'Optimize now', exact: true })).toHaveCount(0);
  await expect(settings.getByText('Training folder ·', { exact: true })).toBeVisible({ timeout: 90_000 });
  const optimized = await capture(desktopSession);
  save('trained', { ...optimized, idleElapsedMs: Date.now() - idleStarted });
  expect(Date.now() - idleStarted).toBeGreaterThanOrEqual(30_000);
  expect(optimized.states).toEqual(before.states);
  expect(optimized.facts).toEqual(before.facts);
  expect(optimized.models).toHaveLength(1);
  expect(optimized.models[0]).toMatchObject({ folderId: 'folder', reviewCount: 1024, enabled: true });
  await page.screenshot({ path: `${output}/trained.png` });
  await page.keyboard.press('Escape');
  await expect(settings).not.toBeVisible();
  await enterReview(page);
  await grade(page, app, 1025);
  const check = await readTrainedGrade(app);
  save('graded', { ...await capture(desktopSession), check });
  expect(check!.actual).toEqual({ stability: check!.expected.stability, difficulty: check!.expected.difficulty,
    scheduled_days: check!.expected.scheduled_days });
  expect(check!.expected).not.toEqual(check!.defaults);
  await verifyRestart(desktopSession);
});
