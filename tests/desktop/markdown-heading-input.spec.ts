import { mkdir } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function createEmptyTopic(windowPage: Page) {
  await windowPage.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
  await windowPage.waitForTimeout(6000);
  const previousNodeId = await windowPage.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  await windowPage.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect
    .poll(() => windowPage.evaluate(() =>
      globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null))
    .not.toBe(previousNodeId);
  const nodeId = await windowPage.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  expect(nodeId).toBeTruthy();
  return nodeId!;
}

async function setEditorSelection(windowPage: Page, position: number) {
  await expect
    .poll(() => windowPage.evaluate((targetPosition) =>
      globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', targetPosition, targetPosition) ?? false,
    position))
    .toBe(true);
}

async function collectHeadingInputState(windowPage: Page, nodeId: string) {
  return windowPage.evaluate((targetNodeId) => {
    const line = document.querySelector<HTMLElement>('.prompt-editor-host .cm-line');
    return {
      editorContent: globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null,
      lineClassName: line?.className ?? null,
      lineInnerText: line?.innerText ?? null,
      lineTextContent: line?.textContent ?? null,
      nodeContent: globalThis.window?.__folioleWorkspaceDebug?.getNode?.(targetNodeId)?.content ?? null,
      prefixHiddenText: document.querySelector<HTMLElement>('.prompt-editor-host .cm-line-h1 .cm-md-heading-syntax-hidden')?.textContent ?? null
    };
  }, nodeId);
}

test('keeps a typed markdown H1 marker at the line start while editing', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const nodeId = await createEmptyTopic(desktopWindow);

  await setEditorSelection(desktopWindow, 0);
  await desktopWindow.locator('.prompt-editor-host .cm-content').click();
  await desktopWindow.keyboard.insertText('#');
  await desktopWindow.keyboard.press('Space');
  await desktopWindow.keyboard.insertText('123');

  await expect.poll(() => collectHeadingInputState(desktopWindow, nodeId)).toMatchObject({
    editorContent: '# 123',
    lineClassName: expect.stringContaining('cm-line-h1'),
    lineInnerText: '123',
    lineTextContent: '# 123',
    prefixHiddenText: '# '
  });

  await mkdir('.tmp/artifacts/desktop', { recursive: true });
  await desktopWindow.screenshot({
    fullPage: false,
    path: '.tmp/artifacts/desktop/markdown-heading-input.png'
  });
  await testInfo.attach('markdown-heading-input-state', {
    body: JSON.stringify(await collectHeadingInputState(desktopWindow, nodeId), null, 2),
    contentType: 'application/json'
  });
});
