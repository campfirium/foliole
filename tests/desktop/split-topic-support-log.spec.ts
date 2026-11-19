import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { resetDailyFlowGeneration } from './harness/dailyFlowGeneration';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const sourceId = 'private-split-topic-id';
const sourceTitle = 'Private Split Topic Title';
const sourceBody = 'Private original paragraph.';
const addedBody = 'Private added paragraph.';
const customDelimiter = 'private-custom-delimiter';
const blockedId = 'private-blocked-item-id';

async function seedTopics(page: Page) {
  await expectWorkspaceShell(page);
  await page.evaluate(async ({ sourceId, sourceTitle, sourceBody, blockedId }) => {
    localStorage.setItem('foliole-app-language', 'en');
    const workspace = window.__folioleWorkspaceDebug!;
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    for (const node of Object.values(snapshot.nodesById)) {
      if (node.kind === 'topic' || node.kind === 'item') await workspace.deleteNode(node.id);
    }
    await workspace.seedNodes([
      { id: sourceId, kind: 'topic', title: sourceTitle, content: sourceBody },
      {
        id: blockedId, kind: 'item', title: 'Item fixture', content: 'Item body',
        review: { due: '2099-01-01T00:00:00.000Z', lastReviewAt: null, state: 0,
          stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }
      }
    ], { persist: true });
  }, { sourceId, sourceTitle, sourceBody, blockedId });
}

async function openAbout(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const about = page.getByRole('button', { name: 'About', exact: true });
  await about.click();
  return page.getByRole('dialog').filter({ has: about });
}

async function clickSplitTopic(page: Page) {
  await page.getByRole('button', { name: 'More editor options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Split Topic', exact: true }).click();
}

async function readRecording(logs: string) {
  const file = (await readdir(logs)).find(name => name.endsWith('.txt'));
  const text = await readFile(path.join(logs, file!), 'utf8');
  const entries = text.trimEnd().split('\n').map(line => JSON.parse(line))
    .filter(entry => entry.event?.startsWith('split.topic.'));
  return { text, entries };
}

async function editAndSplitTopic(page: Page) {
  const editor = page.getByRole('textbox', { name: 'Prompt editor', exact: true });
  await expect(editor).toContainText(sourceBody);
  await editor.click();
  await page.keyboard.press('Meta+End');
  await page.keyboard.insertText(`\n\n---\n\n${addedBody}`);
  await expect(editor).toContainText(addedBody);
  await clickSplitTopic(page);
  const dialog = page.getByRole('dialog', { name: 'Split Topic', exact: true });
  const delimiter = dialog.getByRole('textbox', { name: 'Delimiter', exact: true });
  const confirm = dialog.getByRole('button', { name: 'Split Topic', exact: true });
  await expect(confirm).toBeEnabled();
  await delimiter.fill(customDelimiter);
  await expect(confirm).toBeDisabled();
  await delimiter.fill('---');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toBeHidden();
  const addedNode = await page.evaluate(async (title) => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    return Object.values(snapshot.nodesById).find(node => node.title === title)?.id;
  }, addedBody);
  expect(addedNode).toBeTruthy();
  expect(await page.evaluate(async id =>
    (await window.electronAPI.invoke('load_node_document', { nodeId: id! }))?.content.trim(), addedNode
  )).toBe(addedBody);
}

function expectTrace(entries: Awaited<ReturnType<typeof readRecording>>['entries']) {
  const stage = (stage: string) => ({ event: 'split.topic.stage', attempt: 2, stage, at: expect.any(String) });
  const preview = (delimiter: string, parts: number) => ({
    event: 'split.topic.preview', attempt: 2, delimiter, parts, at: expect.any(String)
  });
  expect(entries).toEqual([
    { event: 'split.topic.clicked', attempt: 1, inFlow: false, enabled: false, at: expect.any(String) },
    { event: 'split.topic.clicked', attempt: 2, inFlow: true, enabled: true, at: expect.any(String) },
    stage('dialog-requested'),
    stage('dialog-opened'),
    preview('matched', 2),
    preview('unmatched', 0),
    preview('matched', 2),
    stage('confirmed'),
    stage('saved')
  ]);
}

test('records blocked and saved Split Topic attempts in the local support file', async ({ desktopApp, desktopWindow: page }) => {
  const logs = path.join(await desktopApp.evaluate(({ app }) => app.getPath('userData')), 'logs', 'support-recordings');
  await seedTopics(page);
  await expect(() => resetDailyFlowGeneration(desktopApp)).toPass({ timeout: 5000 });
  await page.reload();
  await expectWorkspaceShell(page);
  const settings = await openAbout(page);
  await settings.getByRole('button', { name: 'Start recording' }).click();
  await expect(settings.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  await page.evaluate(id => window.__folioleWorkspaceDebug!.openNode(id), blockedId);
  await clickSplitTopic(page);
  await expect(page.getByRole('dialog', { name: 'Split Topic', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Enter Flow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Read', exact: true })).toBeEnabled();
  await editAndSplitTopic(page);

  await expect.poll(async () => (await readRecording(logs)).entries.at(-1)?.stage).toBe('saved');
  await openAbout(page);
  await settings.getByRole('button', { name: 'Stop recording' }).click();
  await expect(settings.getByRole('button', { name: 'Open log' })).toBeVisible();
  const { text, entries } = await readRecording(logs);
  expectTrace(entries);
  for (const privateValue of [sourceId, sourceTitle, sourceBody, addedBody, customDelimiter, blockedId])
    expect(text).not.toContain(privateValue);

  await page.keyboard.press('Escape');
  await clickSplitTopic(page);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await readRecording(logs)).text).toBe(text);
  const evidence = path.resolve('.tmp/artifacts/T810');
  await mkdir(evidence, { recursive: true });
  await writeFile(path.join(evidence, 'split-topic-events.ndjson'), entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
});
