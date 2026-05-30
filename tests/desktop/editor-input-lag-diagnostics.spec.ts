import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const TARGET_ID = 'playwright-editor-input-lag-topic';
const TARGET_TITLE = 'Playwright Editor Input Lag Topic';
const TOPIC_FOLDER_ID = 'playwright-editor-input-lag-folder';
const BASE_CONTENT = [
  '# Playwright input lag target',
  '',
  'This document intentionally contains ordinary unanchored prose.',
  'It has no text anchors, no highlight children, and no image regions.',
  'The diagnostic scenario types plain digits into the body editor.'
].join('\n');

function createDenseWorkspaceNodes() {
  const topics = Array.from({ length: 820 }, (_, index) => ({
    content: index === 0 ? BASE_CONTENT : `Reference body ${index}`,
    id: index === 0 ? TARGET_ID : `playwright-editor-input-lag-neighbor-${index}`,
    kind: 'topic' as const,
    parentNodeId: TOPIC_FOLDER_ID,
    title: index === 0 ? TARGET_TITLE : `Input lag neighbor ${index}`
  }));
  return [
    { content: '', id: TOPIC_FOLDER_ID, kind: 'folder' as const, title: 'Input Lag Folder' },
    ...topics
  ];
}

async function seedInputLagWorkspace(page: Page) {
  await page.waitForTimeout(6000);
  const seedOnce = () => page.evaluate(async ({ nodes, targetId }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    if (!api) return { activeNodeId: null, opened: false, seeded: false };
    await api?.seedNodes?.(nodes);
    const opened = await api?.openNode?.(targetId);
    return {
      activeNodeId: api?.getActiveNodeId?.() ?? null,
      opened: opened === true,
      seeded: api?.getNode?.(targetId)?.id === targetId
    };
  }, { nodes: createDenseWorkspaceNodes(), targetId: TARGET_ID });
  const seeded = await seedOnce();
  expect(seeded).toMatchObject({ activeNodeId: TARGET_ID, opened: true, seeded: true });
  await page.waitForTimeout(3000);
  const reseeded = await seedOnce();
  expect(reseeded).toMatchObject({ activeNodeId: TARGET_ID, opened: true, seeded: true });
  await page.locator('.prompt-editor-host .cm-content').waitFor({ state: 'visible' });
  await expect
    .poll(() =>
      page.evaluate((position) =>
        ({
          activeNodeId: globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null,
          content: globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor') ?? '',
          selectionSet: globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', position, position) ?? false
        }),
        BASE_CONTENT.length
      )
    )
    .toMatchObject({
      activeNodeId: TARGET_ID,
      content: BASE_CONTENT,
      selectionSet: true
    });
  await page.locator('.prompt-editor-host .cm-content').click();
}

async function runTypingSample(page: Page) {
  await page.evaluate(() => globalThis.folioleEditorInputDiagnostics?.start?.());
  await page.keyboard.type('1111111111111111111111111111111111111111', { delay: 18 });
  await page.waitForTimeout(250);
  await page.keyboard.type('2222222222222222222222222222222222222222', { delay: 18 });
  const activeAfterTyping = await page.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  expect(activeAfterTyping).toBe(TARGET_ID);
  await page.waitForFunction(
    () => (globalThis.folioleEditorInputDiagnostics?.records ?? [])
      .some((record) => record.event === 'update-node-content-runtime-persist'),
    undefined,
    { timeout: 5000 }
  ).catch(() => undefined);
  await page.waitForTimeout(500);
  return page.evaluate(() => globalThis.folioleEditorInputDiagnostics?.export?.() ?? null);
}

function summarizeDiagnostics(exported: unknown) {
  const records = typeof exported === 'object' && exported !== null && Array.isArray((exported as { records?: unknown }).records)
    ? (exported as { records: Array<{ atMs: number; details: Record<string, unknown>; event: string; sequence: number }> }).records
    : [];
  const lagRecords = records.filter((record) => record.event === 'renderer-event-loop-lag');
  const counts = records.reduce<Record<string, number>>((accumulator, record) => {
    accumulator[record.event] = (accumulator[record.event] ?? 0) + 1;
    return accumulator;
  }, {});
  const lagWindows = lagRecords.map((lag) => ({
    lagMs: lag.details.lagMs,
    sequence: lag.sequence,
    preceding: records
      .filter((record) => record.atMs <= lag.atMs && lag.atMs - record.atMs <= 240)
      .map((record) => ({ event: record.event, sequence: record.sequence, deltaMs: Math.round(lag.atMs - record.atMs) }))
  }));
  return { counts, lagWindows, totalRecords: records.length };
}

test('collects editor input lag diagnostics while typing plain body text', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedInputLagWorkspace(desktopWindow);

  const diagnostics = await runTypingSample(desktopWindow);
  const summary = summarizeDiagnostics(diagnostics);

  console.log('[editor-input-lag-diagnostics]', JSON.stringify(summary, null, 2));
  console.log('[editor-input-lag-diagnostics-full]', JSON.stringify(diagnostics, null, 2));
  await testInfo.attach('editor-input-lag-diagnostics', {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach('editor-input-lag-summary', {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json'
  });

  expect(summary.totalRecords).toBeGreaterThan(0);
});
