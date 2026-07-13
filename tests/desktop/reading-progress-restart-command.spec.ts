import fs from 'node:fs';

import { expect, test } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expectWorkspaceShell } from './harness/settings';

const TARGET_TITLE = 'GTD 项目管理方法';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readTraceEvents(logPath: string) {
  if (!fs.existsSync(logPath)) {
    return [];
  }
  return fs.readFileSync(logPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { event: string; payload: unknown; timestamp: number });
}

test('records save and hydrate events across in-app restart', async ({ browserName }, testInfo) => {
  void browserName;
  let session: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;

  try {
    session = await launchDesktopSession();
    const page = session.firstWindow;
    await expectWorkspaceShell(page);
    await page.getByRole('treeitem', { name: new RegExp(TARGET_TITLE) }).first().click();
    await expect(page.getByRole('button', { name: TARGET_TITLE, exact: true })).toBeVisible();

    const beforeRestart = await page.evaluate(async () => {
      const scroller = document.querySelector('.prompt-editor-host .cm-scroller') as HTMLElement | null;
      if (!(scroller instanceof HTMLElement)) {
        return { reason: 'missing-scroller' };
      }
      const nodeId = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
      scroller.scrollTop = Math.max(0, scroller.scrollHeight * 0.68);
      scroller.dispatchEvent(new Event('scroll'));
      await new Promise((resolve) => globalThis.setTimeout(resolve, 1300));
      const paths = await window.electronAPI.invoke('resolve_app_paths', {});
      return {
        nodeId,
        nodeViewState: nodeId ? globalThis.window?.__folioleWorkspaceDebug?.getNodeViewState?.(nodeId) ?? null : null,
        paths,
        scrollTop: scroller.scrollTop
      };
    });

    await testInfo.attach('restart-command-before', {
      body: JSON.stringify(beforeRestart, null, 2),
      contentType: 'application/json'
    });

    expect(beforeRestart.scrollTop).toBeGreaterThan(0);
    expect(beforeRestart.nodeViewState?.scrollTop).toBeGreaterThan(0);

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+P' : 'Control+P');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search commands' }).fill('Restart App');
    await page.getByRole('button', { name: 'Restart App' }).click();

    await sleep(5000);

    const logPath = `${beforeRestart.paths.app_log_dir}\\reading-position.ndjson`;
    const events = readTraceEvents(logPath);
    console.log('[restart-command] logPath', logPath);
    console.log('[restart-command] events', JSON.stringify(events, null, 2));
    await testInfo.attach('restart-command-reading-position-log', {
      body: JSON.stringify(events, null, 2),
      contentType: 'application/json'
    });

    expect(events.some((entry) => entry.event === 'reading-progress.restart-begin')).toBe(true);
    expect(events.some((entry) => entry.event === 'reading-progress.restart-saved')).toBe(true);
    expect(events.some((entry) => entry.event === 'reading-progress.restart-command')).toBe(true);
    expect(events.some((entry) => entry.event === 'reading-progress.db-save')).toBe(true);
    expect(events.some((entry) => entry.event === 'reading-progress.db-load')).toBe(true);
    expect(events.some((entry) => entry.event === 'reading-progress.hydrate-load')).toBe(true);
    expect(events.some((entry) => entry.event === 'reading-progress.hydrate-merge')).toBe(true);
  } finally {
    await session?.close().catch(() => undefined);
  }
});
