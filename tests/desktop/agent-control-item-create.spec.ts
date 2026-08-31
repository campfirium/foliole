import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const QUESTION = 'Why does retrieval practice improve memory?';
const ANSWER = 'It strengthens recall by requiring active retrieval.';
const EVIDENCE_PATH = path.join(process.cwd(), '.tmp/artifacts/agent-control-item-create.json');

async function readDescriptorPath(session: DesktopSession) {
  const userDataPath = await session.electronApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptorPath = path.join(userDataPath, 'cache', 'agent-control-session.json');
  await expect.poll(async () => {
    try {
      await fs.access(descriptorPath);
      return true;
    } catch {
      return false;
    }
  }).toBe(true);
  return descriptorPath;
}

async function readRendererItem(page: Page, itemId: string) {
  return page.evaluate((id) => globalThis.window?.__folioleWorkspaceDebug?.getNode?.(id) ?? null, itemId);
}

async function openRendererItem(page: Page, itemId: string) {
  expect(await page.evaluate(async (id) =>
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(id) ?? false, itemId)).toBe(true);
  await expect.poll(() => readRendererItem(page, itemId)).toMatchObject({
    content: QUESTION,
    reveal: ANSWER
  });
  return readRendererItem(page, itemId);
}

async function readCliItem(descriptorPath: string, itemId: string) {
  const result = await runAgentCli(['materials/read', '--descriptor', descriptorPath, '--id', itemId]);
  expect(result.status).toBe(0);
  return (result.output as { material: Record<string, unknown> }).material;
}

function expectQuestionAnswerItem(item: Record<string, unknown> | null) {
  expect(item).toMatchObject({
    content: QUESTION,
    kind: 'item',
    parentNodeId: 'special-inbox',
    reveal: ANSWER,
    review: {
      difficulty: 0,
      elapsedDays: 0,
      lapses: 0,
      lastReviewAt: null,
      reps: 0,
      scheduledDays: 0,
      stability: 0,
      state: 0
    },
    title: QUESTION
  });
}

test('creates and hydrates a real question-answer Item through the public CLI', async ({ desktopSession }, testInfo) => {
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  const stateRoot = desktopSession.target.runtimeStateRoot;
  try {
    await expectWorkspaceShell(desktopSession.firstWindow);
    const descriptorPath = await readDescriptorPath(desktopSession);
    const created = await runAgentCli([
      'materials/create', '--descriptor', descriptorPath,
      '--backup-dir', path.join(process.cwd(), '.tmp/artifacts/agent-control-item-backups'),
      '--kind', 'item', '--content', QUESTION, '--reveal', ANSWER, '--parent-id', 'root'
    ]);
    expect(created.status).toBe(0);
    const material = (created.output as { material: Record<string, unknown> }).material;
    const itemId = String(material.id);
    expect(material).toMatchObject({
      content: QUESTION, kind: 'item', parent_id: 'special-inbox', reveal: ANSWER,
      reveal_char_count: ANSWER.length, reveal_truncated: false, title: QUESTION
    });
    expect(await readCliItem(descriptorPath, itemId)).toMatchObject(material);

    await expect.poll(() => readRendererItem(desktopSession.firstWindow, itemId)).not.toBeNull();
    expect(await readRendererItem(desktopSession.firstWindow, itemId)).toMatchObject({
      id: itemId, kind: 'item', parentNodeId: 'special-inbox', title: QUESTION
    });
    expectQuestionAnswerItem(await openRendererItem(desktopSession.firstWindow, itemId));

    await desktopSession.electronApp.close();
    secondSession = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    }) as DesktopSession;
    await expectWorkspaceShell(secondSession.firstWindow);
    await expect.poll(() => readRendererItem(secondSession!.firstWindow, itemId)).not.toBeNull();
    const hydrated = await openRendererItem(secondSession.firstWindow, itemId);
    expectQuestionAnswerItem(hydrated);
    const relaunchedDescriptorPath = await readDescriptorPath(secondSession);
    const relaunchedRead = await readCliItem(relaunchedDescriptorPath, itemId);
    expect(relaunchedRead).toMatchObject({
      content: QUESTION, id: itemId, kind: 'item', parent_id: 'special-inbox', reveal: ANSWER
    });

    await fs.mkdir(path.dirname(EVIDENCE_PATH), { recursive: true });
    await fs.writeFile(EVIDENCE_PATH, `${JSON.stringify({
      accepted_item_id: itemId,
      after_relaunch_api: relaunchedRead,
      after_relaunch_renderer: hydrated,
      before_relaunch_api: material
    }, null, 2)}\n`);
    await testInfo.attach('agent-control-item-create', {
      contentType: 'application/json', path: EVIDENCE_PATH
    });
  } finally {
    await secondSession?.close();
  }
});
