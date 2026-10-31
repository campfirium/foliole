import fs from 'node:fs';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const output = '.tmp/artifacts/T673-8/mac-continuous';

async function prepare(desktopApp: DesktopSession['electronApp'], page: DesktopSession['firstWindow']) {
  await expectWorkspaceShell(page);
  await page.evaluate(async () => {
    window.localStorage.setItem('foliole-app-language', 'en');
    const api = window.__folioleWorkspaceDebug!;
    const previous = await window.electronAPI.invoke('load_workspace_snapshot', {});
    await api.seedNodes(Array.from({ length: 15 }, (_, index) => ({
      id: `continuous-${index}`, kind: index < 12 ? 'item' as const : 'topic' as const,
      title: `Continuous ${index}`, content: `Full body ${index}.\n\nSecond paragraph 中文 ${index}.`,
      ...(index < 12 ? { reveal: `Complete answer ${index}.\n\nAnswer paragraph two.`, review: {
        due: '2026-04-08T00:00:00.000Z', lastReviewAt: null, state: 0 as const,
        stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0
      } } : {})
    })), { persist: true });
    for (const node of Object.values(previous.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await api.deleteNode(node.id);
    }
  });
  // Initial fixture only: discard the tutorial list before any learning action.
  await resetDailyFlowGeneration(desktopApp);
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated());
}

test('keeps the planned reading after five grades and persists its complete learning chain', async ({ desktopApp, desktopWindow: page }) => {
  await prepare(desktopApp, page);
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  const initial = await page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession());
  const planned = await desktopApp.evaluate(() => {
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const connection = require(`${process.cwd()}/dist/electron/database/connection.js`);
    return connection.runWithDatabaseConnectionOwner(() => connection.openDatabaseConnection().driver
      .queryAll('SELECT node_id FROM daily_flow_entries ORDER BY order_key LIMIT 6')
      .map((row: { node_id: string }) => row.node_id)) as string[];
  });
  expect(planned).toHaveLength(6);
  expect(await page.evaluate(id => window.__folioleWorkspaceDebug!.getNode(id)?.kind, planned[5]!)).toBe('topic');
  const grades = ['Again', 'Hard', 'Good', 'Easy', 'Good'];
  for (const [step, grade] of grades.entries()) {
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(planned[step]);
    const index = Number(planned[step]!.replace('continuous-', ''));
    await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('prompt-editor')))
      .toBe(`Full body ${index}.\n\nSecond paragraph 中文 ${index}.`);
    await page.getByRole('button', { name: /^(Show Answer|Reveal Answer)$/ }).click();
    for (const label of ['Again', 'Hard', 'Good', 'Easy']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeEnabled();
    }
    await page.getByRole('button', { name: grade, exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().reviewedItemCount)).toBe(step + 1);
    const saved = await page.evaluate(async id => (await window.electronAPI.invoke('load_workspace_snapshot', {})).nodesById[id], planned[step]!);
    expect(saved?.review?.reps).toBe(1);
    const document = await page.evaluate(nodeId => window.electronAPI.invoke('load_node_document', { nodeId }), planned[step]!);
    expect(document.content).toBe(`Full body ${index}.\n\nSecond paragraph 中文 ${index}.`);
  }
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().currentNodeId)).toBe(planned[5]);
  await page.getByRole('button', { name: /^Read$/, exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug!.getReviewSession().readTopicCount)).toBe(1);
  const beforeReload = await page.evaluate(async ids => ({
    session: window.__folioleWorkspaceDebug!.getReviewSession(),
    disk: await window.electronAPI.invoke('load_workspace_snapshot', {}),
    documents: await Promise.all(ids.map(nodeId => window.electronAPI.invoke('load_node_document', { nodeId })))
  }), planned);
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: `${output}/after-learning.png` });
  await page.reload();
  await expectWorkspaceShell(page);
  await page.getByRole('button', { name: /^Enter Flow$/ }).click();
  const restored = await page.evaluate(async ids => ({
    session: window.__folioleWorkspaceDebug!.getReviewSession(),
    disk: await window.electronAPI.invoke('load_workspace_snapshot', {}),
    documents: await Promise.all(ids.map(nodeId => window.electronAPI.invoke('load_node_document', { nodeId })))
  }), planned);
  expect(restored.session.currentNodeId).toBe(beforeReload.session.currentNodeId);
  expect(restored.session.reviewedItemCount).toBe(5);
  expect(restored.session.readTopicCount).toBe(1);
  expect(beforeReload.documents.every(document => document.content.length > 0)).toBe(true);
  expect(restored.documents).toEqual(beforeReload.documents);
  for (const id of planned) expect(restored.disk.nodesById[id]).toEqual(beforeReload.disk.nodesById[id]);
  fs.writeFileSync(`${output}/result.json`, JSON.stringify({ initial, planned, grades, beforeReload, restored }, null, 2));
});
