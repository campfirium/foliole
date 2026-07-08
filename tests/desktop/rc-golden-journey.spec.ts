import process from 'node:process';

import { launchDesktopSession } from '../../scripts/windows/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import {
  collectFormulaRegionState,
  dragFormulaClozeRegion,
  findFormulaClozeChildId,
  FORMULA
} from './harness/formulaCloze';
import { expectWorkspaceShell } from './harness/settings';

type WindowPage = DesktopSession['firstWindow'];

const TOKEN_PREFIX = `rc-golden-${Date.now()}`;
const A_CONTENT = `# RC Golden Topic A\n\n${TOKEN_PREFIX}-A`;
const B_CONTENT = `# RC Golden Topic B\n\n${TOKEN_PREFIX}-B`;

async function waitForWorkspaceDebug(windowPage: WindowPage) {
  await windowPage.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
}

async function createTopicFromUi(windowPage: WindowPage) {
  await waitForWorkspaceDebug(windowPage);
  const beforeNodeId = await windowPage.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  await windowPage.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect
    .poll(() => windowPage.evaluate((previousNodeId) => {
      const nodeId = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
      return nodeId && nodeId !== previousNodeId ? nodeId : null;
    }, beforeNodeId))
    .not.toBeNull();
  return windowPage.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
}

async function insertEditorContent(windowPage: WindowPage, content: string) {
  await expect
    .poll(() =>
      windowPage.evaluate(() =>
        globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0) ?? false))
    .toBe(true);
  await windowPage.locator('.prompt-editor-host .cm-content').click();
  await windowPage.keyboard.insertText(content);
}

async function openNode(windowPage: WindowPage, nodeId: string) {
  await windowPage.evaluate(async (targetNodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId);
  }, nodeId);
}

async function collectNodeContent(windowPage: WindowPage, nodeId: string) {
  return windowPage.evaluate((targetNodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getNode?.(targetNodeId)?.content ?? null,
  nodeId);
}

async function collectEditorContent(windowPage: WindowPage) {
  return windowPage.evaluate(() =>
    globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null);
}

async function waitForContentPersistence(windowPage: WindowPage, nodeA: string, nodeB: string) {
  await expect.poll(() => collectNodeContent(windowPage, nodeA)).toBe(A_CONTENT);
  await expect.poll(() => collectNodeContent(windowPage, nodeB)).toBe(B_CONTENT);
  await windowPage.waitForTimeout(1800);
}

async function expectOpenedNodeContent(windowPage: WindowPage, expected: string, rejected: string) {
  await expect(windowPage.locator('.prompt-editor-host .cm-content')).toContainText(expected.split('\n').at(-1)!);
  await expect.poll(() => collectEditorContent(windowPage)).toBe(expected);
  await expect.poll(() => collectEditorContent(windowPage)).not.toContain(rejected);
}

async function attachWorkspaceScreenshot(windowPage: WindowPage, name: string, testInfo: { attach: (name: string, options: { body: Buffer; contentType: string }) => Promise<void> }) {
  await testInfo.attach(name, {
    body: await windowPage.screenshot({ fullPage: false }),
    contentType: 'image/png'
  });
}

async function relaunchDesktopSession(session: DesktopSession) {
  const stateRoot = session.target.runtimeStateRoot;
  await session.electronApp.close();
  return launchDesktopSession({
    env: {
      ...process.env,
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
    }
  }) as Promise<DesktopSession>;
}

test('keeps A and B topic edits isolated across switches and relaunch', async ({ desktopSession, desktopWindow }, testInfo) => {
  let secondSession: DesktopSession | null = null;

  try {
    await expectWorkspaceShell(desktopWindow);
    const nodeA = await createTopicFromUi(desktopWindow);
    expect(nodeA).toBeTruthy();
    await insertEditorContent(desktopWindow, A_CONTENT);

    const nodeB = await createTopicFromUi(desktopWindow);
    expect(nodeB).toBeTruthy();
    await insertEditorContent(desktopWindow, B_CONTENT);

    await openNode(desktopWindow, nodeA!);
    await expectOpenedNodeContent(desktopWindow, A_CONTENT, TOKEN_PREFIX + '-B');
    await openNode(desktopWindow, nodeB!);
    await expectOpenedNodeContent(desktopWindow, B_CONTENT, TOKEN_PREFIX + '-A');

    await waitForContentPersistence(desktopWindow, nodeA!, nodeB!);
    await attachWorkspaceScreenshot(desktopWindow, 'rc-golden-ab-before-relaunch', testInfo);

    secondSession = await relaunchDesktopSession(desktopSession);
    await expectWorkspaceShell(secondSession.firstWindow);

    await openNode(secondSession.firstWindow, nodeA!);
    await expectOpenedNodeContent(secondSession.firstWindow, A_CONTENT, TOKEN_PREFIX + '-B');
    await openNode(secondSession.firstWindow, nodeB!);
    await expectOpenedNodeContent(secondSession.firstWindow, B_CONTENT, TOKEN_PREFIX + '-A');
    await attachWorkspaceScreenshot(secondSession.firstWindow, 'rc-golden-ab-after-relaunch', testInfo);
  } finally {
    await secondSession?.close();
  }
});

test('keeps a dragged formula cloze visible before and after relaunch', async ({ desktopSession, desktopWindow }, testInfo) => {
  let secondSession: DesktopSession | null = null;

  try {
    await expectWorkspaceShell(desktopWindow);
    await desktopWindow.evaluate(async ({ formula }) => {
      const api = globalThis.window?.__folioleWorkspaceDebug;
      await api?.seedNodes?.([{ content: formula, id: 'playwright-formula-drag-parent', kind: 'topic', title: 'RC Golden Formula Parent' }]);
      await api?.openNode?.('playwright-formula-drag-parent');
    }, { formula: FORMULA });

    await dragFormulaClozeRegion(desktopWindow);
    await expect.poll(() => findFormulaClozeChildId(desktopWindow)).not.toBeNull();
    const childId = await findFormulaClozeChildId(desktopWindow);
    expect(childId).toBeTruthy();

    const parentState = await collectFormulaRegionState(desktopWindow);
    expect(parentState.outlined).toBe('true');
    expect(parentState.hidden).toBe('false');
    expect(parentState.width).toBeGreaterThan(8);
    expect(parentState.height).toBeGreaterThan(8);

    await openNode(desktopWindow, childId!);
    const childState = await collectFormulaRegionState(desktopWindow);
    expect(childState.hidden).toBe('true');
    expect(childState.outlined).toBe('false');
    expect(childState.opacity).toBe('1');
    expect(childState.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(childState.width).toBeGreaterThan(8);
    expect(childState.height).toBeGreaterThan(8);
    await attachWorkspaceScreenshot(desktopWindow, 'rc-golden-cloze-before-relaunch', testInfo);

    secondSession = await relaunchDesktopSession(desktopSession);
    await expectWorkspaceShell(secondSession.firstWindow);
    await openNode(secondSession.firstWindow, 'playwright-formula-drag-parent');
    const parentStateAfterRelaunch = await collectFormulaRegionState(secondSession.firstWindow);
    expect(parentStateAfterRelaunch.outlined).toBe('true');
    expect(parentStateAfterRelaunch.width).toBeGreaterThan(8);
    expect(parentStateAfterRelaunch.height).toBeGreaterThan(8);

    await openNode(secondSession.firstWindow, childId!);
    const childStateAfterRelaunch = await collectFormulaRegionState(secondSession.firstWindow);
    expect(childStateAfterRelaunch.hidden).toBe('true');
    expect(childStateAfterRelaunch.opacity).toBe('1');
    expect(childStateAfterRelaunch.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(childStateAfterRelaunch.width).toBeGreaterThan(8);
    expect(childStateAfterRelaunch.height).toBeGreaterThan(8);
    await attachWorkspaceScreenshot(secondSession.firstWindow, 'rc-golden-cloze-after-relaunch', testInfo);
  } finally {
    await secondSession?.close();
  }
});
