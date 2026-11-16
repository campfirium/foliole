import type { ElectronApplication, Page } from '@playwright/test';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

type GradeProbe = {
  holdRefresh: boolean;
  holdLearning: boolean;
  refreshReleases: Array<() => void>;
  learningReleases: Array<() => void>;
};
type ProbeGlobal = typeof globalThis & { clozeGradeProbe: GradeProbe };

async function prepare(page: Page, app: ElectronApplication) {
  await expectWorkspaceShell(page);
  await page.evaluate(() => localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    const api = window.__folioleWorkspaceDebug!;
    const existing = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(existing.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await api.deleteNode(node.id);
    }
    await api.seedNodes([{ id: 'cloze-grade-source', kind: 'topic', title: 'Cloze source',
      content: 'Alpha Beta Gamma Delta', priority: 9 }, ...['Alpha', 'Beta', 'Gamma', 'Delta'].map((answer, index) => ({
      id: `edited-cloze-${index}`, kind: 'item' as const, parentNodeId: 'cloze-grade-source',
      title: `Cloze ${answer}`, content: `Question ${answer}`, reveal: answer,
      anchorLink: { id: `cloze-anchor-${index}`, kind: 'cloze' as const,
        locator: { from: 'Alpha Beta Gamma Delta'.indexOf(answer),
          to: 'Alpha Beta Gamma Delta'.indexOf(answer) + answer.length, originalText: answer } },
      review: { due: '2026-01-01T00:00:00.000Z', lastReviewAt: null, state: 0 as const,
        stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }
    }))], { persist: true });
  });
  await resetDailyFlowGeneration(app);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  await expect(page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ })).toBeVisible();
}

async function edit(page: Page, suffix: string) {
  const editor = page.locator('.prompt-editor-host .cm-content');
  await editor.focus();
  expect(await page.evaluate(() => {
    const node = window.__folioleWorkspaceDebug!.getNode(window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId!);
    return window.__folioleDebug?.setEditorSelection?.('prompt-editor', node!.content.length, node!.content.length);
  })).toBe(true);
  await expect(editor).toBeFocused();
  await page.keyboard.insertText(suffix);
  await expect(editor).toContainText(suffix);
}

async function installProbe(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    const probe: GradeProbe = { holdRefresh: true, holdLearning: false, refreshReleases: [], learningReleases: [] };
    (globalThis as ProbeGlobal).clozeGradeProbe = probe;
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request) => {
      const result = await handleInvokeRequest(request, { sender: event.sender });
      if (probe.holdRefresh && request.command === 'open_daily_flow' && request.args.preserveCurrent)
        await new Promise<void>(resolve => probe.refreshReleases.push(resolve));
      if (probe.holdLearning && request.command === 'load_node_learning')
        await new Promise<void>(resolve => probe.learningReleases.push(resolve));
      return result;
    });
  });
}

const current = (page: Page) => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
const document = (page: Page, id: string) => page.evaluate(nodeId => window.electronAPI.invoke('load_node_document', { nodeId }), id);

test('saves the first grade after a settled cloze edit and retains edits after reload', async ({ desktopApp, desktopWindow: page }) => {
  await prepare(page, desktopApp);
  const edited = new Map<string, string>();
  for (const [index, label] of ['Good', 'Easy', 'Hard', 'Good'].entries()) {
    await expect(page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ })).toBeVisible();
    const id = (await current(page)).currentNodeId!;
    expect(id).toMatch(/^edited-cloze-/);
    if (index > 0) {
      const suffix = ` Edited ${index}`;
      await edit(page, suffix);
      await expect.poll(async () => (await document(page, id))?.content).toContain(suffix);
      edited.set(id, suffix);
    }
    await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(async () => (await current(page)).currentNodeId).not.toBe(id);
    await expect(page.getByText('Failed to save grade. Please retry.', { exact: true })).toBeHidden();
  }
  await page.reload();
  await expectWorkspaceShell(page);
  for (const [id, suffix] of edited) expect((await document(page, id))?.content).toContain(suffix);
});

test('grades an edited cloze once while its real Flow refresh completes during the learning read', async ({ desktopApp, desktopWindow: page }) => {
  await prepare(page, desktopApp);
  await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
  await expect(page.getByRole('button', { name: 'Good', exact: true })).toBeEnabled();
  const before = await current(page);
  await installProbe(desktopApp);
  try {
    await edit(page, ' Preserved edit');
    await expect.poll(async () => (await document(page, before.currentNodeId!))?.content).toContain(' Preserved edit');
    await expect.poll(() => desktopApp.evaluate(() => (globalThis as ProbeGlobal).clozeGradeProbe.refreshReleases.length)).toBeGreaterThan(0);
    await desktopApp.evaluate(() => { (globalThis as ProbeGlobal).clozeGradeProbe.holdLearning = true; });
    await page.getByRole('button', { name: 'Good', exact: true }).click();
    await expect.poll(() => desktopApp.evaluate(() => (globalThis as ProbeGlobal).clozeGradeProbe.learningReleases.length)).toBeGreaterThan(0);
    await desktopApp.evaluate(() => {
      const probe = (globalThis as ProbeGlobal).clozeGradeProbe;
      probe.holdRefresh = false;
      probe.refreshReleases.splice(0).forEach(release => release());
    });
    await expect.poll(async () => (await current(page)).daily?.revision).not.toBe(before.daily?.revision);
    await desktopApp.evaluate(() => {
      const probe = (globalThis as ProbeGlobal).clozeGradeProbe;
      probe.holdLearning = false;
      probe.learningReleases.splice(0).forEach(release => release());
    });
    await expect.poll(async () => (await current(page)).currentNodeId).not.toBe(before.currentNodeId);
    await expect(page.getByText('Failed to save grade. Please retry.', { exact: true })).toBeHidden();
    await page.reload();
    await expectWorkspaceShell(page);
    expect((await document(page, before.currentNodeId!))?.content).toContain(' Preserved edit');
    const snapshot = await page.evaluate(() => window.electronAPI.invoke('load_workspace_snapshot', {}));
    expect(snapshot.nodesById[before.currentNodeId!]?.review?.reps).toBe(1);
  } finally {
    await desktopApp.evaluate(() => {
      const probe = (globalThis as ProbeGlobal).clozeGradeProbe;
      probe.holdLearning = false;
      probe.holdRefresh = false;
      [...probe.refreshReleases, ...probe.learningReleases].forEach(release => release());
    });
    await page.screenshot({ path: '.tmp/artifacts/issue-266-cloze-grade.png' });
  }
});
