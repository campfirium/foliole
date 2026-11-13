import fs from 'node:fs/promises';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { runAgentCli } from '../../scripts/agent-control/foliole-agent.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE = 'Agent excerpt source';
const PASSAGE = 'Repeated 🌱 passage';
const BODY = `${PASSAGE} first.\n\n${PASSAGE} second.`;
const FROM = BODY.lastIndexOf(PASSAGE);
const TO = FROM + PASSAGE.length;
const EXTRA_ARGS = process.platform === 'darwin' ? ['--use-mock-keychain'] : [];

async function descriptorPath(session: DesktopSession) {
  const userData = await session.electronApp.evaluate(({ app }) => app.getPath('userData'));
  const descriptor = path.join(userData, 'cache', 'agent-control-session.json');
  await expect.poll(() => fs.access(descriptor).then(() => true, () => false)).toBe(true);
  return descriptor;
}

async function runCli(descriptor: string, args: string[]) {
  const result = await runAgentCli([...args, '--descriptor', descriptor]);
  expect(result.status).toBe(0);
  return (result.output as { material: { id: string; updated_at: string } }).material;
}

async function openExcerptAndJump(page: Page, excerptId: string, sourceId: string) {
  await expect.poll(() => page.evaluate((id) =>
    Boolean(window.__folioleWorkspaceDebug?.getNode?.(id)), excerptId)).toBe(true);
  expect(await page.evaluate(async (id) =>
    await window.__folioleWorkspaceDebug?.openNode?.(id), excerptId)).toBe(true);
  await expect(page.locator('.prompt-editor-host .cm-content')).toHaveText(PASSAGE);
  await page.getByRole('navigation', { name: /^(Breadcrumb|面包屑)$/ })
    .getByRole('button', { name: SOURCE }).click();
  await expect.poll(() => page.evaluate(() => ({
    active: window.__folioleWorkspaceDebug?.getActiveNodeId?.(),
    position: window.__folioleDebug?.getEditorSelection?.('prompt-editor')?.from
  }))).toEqual({ active: sourceId, position: FROM });
  const editor = page.locator('.prompt-editor-host');
  await expect(editor.locator('.cm-md-highlight')).toHaveText(PASSAGE);
  await expect(editor.locator('.cm-line').filter({ has: page.locator('.cm-md-highlight') }))
    .toHaveText(`${PASSAGE} second.`);
}

test('creates a desktop excerpt via CLI and returns to the chosen occurrence after restart', async ({ browserName }) => {
  void browserName;
  const first = await launchDesktopSession({ extraArgs: EXTRA_ARGS }) as DesktopSession;
  let second: DesktopSession | undefined;
  try {
    await expectWorkspaceShell(first.firstWindow);
    const descriptor = await descriptorPath(first);
    const source = await runCli(descriptor, ['materials/create', '--kind', 'topic', '--title', SOURCE, '--content', BODY]);
    const read = await runCli(descriptor, ['materials/read', '--id', source.id, '--content-mode', 'full']);
    const excerpt = await runCli(descriptor, ['materials/create-text-excerpt', '--source-id', source.id,
      '--expected-updated-at', read.updated_at, '--from', String(FROM), '--to', String(TO)]);
    await openExcerptAndJump(first.firstWindow, excerpt.id, source.id);

    await first.electronApp.close();
    second = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: first.target.runtimeStateRoot },
      extraArgs: EXTRA_ARGS
    }) as DesktopSession;
    await expectWorkspaceShell(second.firstWindow);
    await openExcerptAndJump(second.firstWindow, excerpt.id, source.id);
  } finally {
    await second?.close();
    await first.close();
  }
});
