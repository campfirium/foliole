import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ids = ['flow-grade-private-one', 'flow-grade-private-two', 'flow-grade-private-three'];
const privateText = 'PRIVATE Grade Fixture';
const top = (page: Page) => page.getByRole('button', { name: 'Enter Flow', exact: true });
const toolbar = (page: Page) => page.getByRole('group', { name: 'Flow toolbar', exact: true });
const easy = (page: Page) => toolbar(page).getByRole('button', { name: 'Easy', exact: true });
const cursor = (page: Page) => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId);
const reveal = (page: Page) => toolbar(page).getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();

async function seedFlow(page: Page, app: DesktopSession['electronApp'], count = ids.length) {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
  await page.evaluate(async ({ ids, privateText }) => {
    localStorage.setItem('foliole-app-language', 'en');
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await window.__folioleWorkspaceDebug!.deleteNode(node.id);
    }
    await window.__folioleWorkspaceDebug!.seedNodes(ids.map((id, index) => ({
      id, kind: 'item', title: privateText + ' Title', content: privateText + ' Body',
      reveal: privateText + ' Answer',
      review: { due: `2026-04-0${index + 1}T00:00:00.000Z`, lastReviewAt: null, state: 0,
        stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }
    })), { persist: true });
  }, { ids: ids.slice(0, count), privateText });
  await app.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver.transaction((driver: { execute(sql: string): void }) => {
      for (const table of ['daily_flow_entries', 'daily_flow_state', 'daily_flow_operations']) driver.execute(`DELETE FROM ${table}`);
    }));
  });
  await page.reload();
  await expectWorkspaceShell(page);
  const exit = page.getByRole('button', { name: 'Exit Flow', exact: true });
  if (await exit.isVisible()) await exit.click();
  await top(page).click();
}

async function openAbout(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const about = page.getByRole('button', { name: 'About', exact: true });
  await about.click();
  return page.getByRole('dialog').filter({ has: about });
}

async function flowLog(logs: string) {
  const [file] = await readdir(logs);
  const text = await readFile(path.join(logs, file!), 'utf8');
  const entries = text.trimEnd().split('\n').map(line => JSON.parse(line))
    .filter(entry => entry.event?.startsWith('flow.grade.'));
  return { entries, file: path.join(logs, file!), text };
}

async function readSavedGrade(app: DesktopSession['electronApp'], nodeId: string) {
  return app.evaluate((_, id) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const db = connection.openDatabaseConnection().sqlite;
      return {
        grade: db.prepare("SELECT grade FROM review_log WHERE node_id = ? AND kind = 'review'").get(id)?.grade,
        next: JSON.parse(db.prepare('SELECT session_json FROM daily_flow_state WHERE id = 1').get().session_json).currentNodeId
      };
    });
  }, nodeId);
}

function refuseEditorFlush(page: Page) {
  return page.evaluateHandle(() => {
    const original = window.__folioleFlushPendingEditorDraftBeforeClose;
    window.__folioleFlushPendingEditorDraftBeforeClose = async () => false;
    return () => { if (original) window.__folioleFlushPendingEditorDraftBeforeClose = original;
      else delete window.__folioleFlushPendingEditorDraftBeforeClose; };
  });
}

function expectExportedGrades(exported: Awaited<ReturnType<typeof flowLog>>, due: string) {
  // Flow may render an empty pane while it loads the next card.
  const entries = exported.entries.filter(entry => entry.event !== 'flow.grade.displayed' || entry.card !== null);
  expect(entries).toEqual([
    { event: 'flow.grade.selected', attempt: 1, grade: 4, card: 1, at: expect.any(String) },
    { event: 'flow.grade.finished', attempt: 1, accepted: false, stage: 'editor-flush-rejected', at: expect.any(String) },
    { event: 'flow.grade.displayed', attempt: 1, card: 1, at: expect.any(String) },
    { event: 'flow.grade.selected', attempt: 2, grade: 4, card: 1, at: expect.any(String) },
    { event: 'flow.grade.saved', attempt: 2, grade: 4, card: 1, dueAtMs: Date.parse(due),
      reviewedAtMs: expect.any(Number), nextCard: 2, at: expect.any(String) },
    { event: 'flow.grade.finished', attempt: 2, accepted: true, stage: null, at: expect.any(String) },
    { event: 'flow.grade.displayed', attempt: 2, card: 2, at: expect.any(String) }
  ]);
  const saved = exported.entries.find(e => e.event === 'flow.grade.saved');
  expect(saved.dueAtMs).toBeGreaterThan(saved.reviewedAtMs);
  for (const secret of [...ids, privateText]) expect(exported.text).not.toContain(secret);
}

async function retainEvidence(name: string, text: string) {
  const directory = path.resolve('.tmp/artifacts/T802');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), text);
}

test('the revealed support file ties a rejected grade and a saved Easy click to what Flow showed', async ({
  desktopApp: app, desktopWindow: page
}) => {
  const root = await app.evaluate(({ app, shell }) => {
    const revealed: string[] = [];
    globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__ = revealed;
    shell.showItemInFolder = file => { revealed.push(file); };
    return app.getPath('userData');
  });
  const logs = path.join(root, 'logs', 'support-recordings');
  await seedFlow(page, app);
  const first = await cursor(page);
  expect(ids).toContain(first);
  await reveal(page);
  await easy(page).click();
  await expect.poll(() => cursor(page)).not.toBe(first);
  const target = (await cursor(page))!;
  expect(ids).toContain(target);

  const settings = await openAbout(page);
  const start = settings.getByRole('button', { name: 'Start recording' });
  await start.click();
  const stop = settings.getByRole('button', { name: 'Stop recording' });
  await expect(stop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  await reveal(page);
  const restoreFlush = await refuseEditorFlush(page);
  await easy(page).click();
  await expect.poll(async () => (await flowLog(logs)).entries.find(e => e.event === 'flow.grade.finished'))
    .toMatchObject({ attempt: 1, accepted: false, stage: 'editor-flush-rejected' });
  expect(await readSavedGrade(app, target)).toEqual({ grade: undefined, next: target });
  await restoreFlush.evaluate(restore => restore());
  await restoreFlush.dispose();
  await easy(page).click();

  await expect.poll(async () => (await flowLog(logs)).entries.filter(e => e.event === 'flow.grade.displayed').at(-1))
    .toMatchObject({ attempt: 2, card: 2 });
  const next = (await cursor(page))!;
  expect(next).not.toBe(target);
  expect(await readSavedGrade(app, target)).toEqual({ grade: 4, next });
  const due = await page.evaluate(async id =>
    (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById[id]?.review?.due, target);
  expect(due).toBeTruthy();

  await openAbout(page);
  await stop.click();
  await settings.getByRole('button', { name: 'Open log' }).click();
  const exported = await flowLog(logs);
  await expect.poll(() => app.evaluate(() => globalThis.__FOLIOLE_TEST_OPENED_EXTERNAL_URLS__)).toEqual([exported.file]);
  expectExportedGrades(exported, due!);
  await page.keyboard.press('Escape');
  await reveal(page);
  await easy(page).click();
  await expect.poll(() => cursor(page)).not.toBe(next);
  expect((await flowLog(logs)).text).toBe(exported.text);
  await retainEvidence('macos-easy-support-log.txt', exported.text);
});

test('the support file identifies Again saves that are immediately due', async ({
  desktopApp: app, desktopWindow: page
}) => {
  const logs = path.join(await app.evaluate(({ app }) => app.getPath('userData')), 'logs', 'support-recordings');
  await seedFlow(page, app, 1);
  const settings = await openAbout(page);
  await settings.getByRole('button', { name: 'Start recording' }).click();
  const stop = settings.getByRole('button', { name: 'Stop recording' });
  await expect(stop).toBeVisible();
  await page.keyboard.press('Escape');
  const target = ids[0]!;
  const again = toolbar(page).getByRole('button', { name: 'Again', exact: true });
  await page.clock.setFixedTime(new Date());
  let immediate = false;
  for (let attempt = 1; attempt <= 8; attempt++) {
    await expect.poll(() => cursor(page)).toBe(target);
    await reveal(page);
    await again.click();
    const recordedSave = async () => (await flowLog(logs)).entries
      .find(e => e.attempt === attempt && e.event === 'flow.grade.saved');
    await expect.poll(recordedSave).toBeDefined();
    const saved = await recordedSave();
    expect(saved).toMatchObject({ grade: 1, card: 1 });
    if (saved.dueAtMs <= saved.reviewedAtMs) {
      expect(saved.nextCard).toBe(1);
      await expect.poll(async () => (await flowLog(logs)).entries
        .find(e => e.attempt === attempt && e.event === 'flow.grade.displayed'))
        .toMatchObject({ card: 1 });
      immediate = true;
      break;
    }
    await expect.poll(() => cursor(page)).toBeNull();
    expect(saved.nextCard).toBeNull();
    await page.clock.setFixedTime(new Date(saved.dueAtMs + 1000));
    await page.getByRole('button', { name: 'Exit Flow', exact: true }).click();
    await top(page).click();
  }
  expect(immediate).toBe(true);
  await openAbout(page);
  await stop.click();
  await expect(settings.getByRole('button', { name: 'Open log' })).toBeVisible();
  await retainEvidence('macos-immediate-again-support-log.txt', (await flowLog(logs)).text);
});
