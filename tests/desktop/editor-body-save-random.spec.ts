import process from 'node:process';

import { launchDesktopSession } from '../../scripts/windows/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const DEFAULT_RANDOM_SEED = 270627;
const NODE_COUNT = 4;
const STEP_COUNT = 24;

type WindowPage = DesktopSession['firstWindow'];
type RandomAction =
  | { kind: 'append'; nodeId: string; text: string }
  | { kind: 'open'; nodeId: string }
  | { kind: 'switchInbox' }
  | { kind: 'wait'; ms: number };

function parseSeed() {
  const raw = process.env.FOLIOLE_EDITOR_RANDOM_SEED?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_RANDOM_SEED;
}

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(rng: () => number, values: readonly T[]) {
  return values[Math.floor(rng() * values.length)]!;
}

async function waitForDebugBridge(windowPage: WindowPage) {
  await windowPage.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
  await windowPage.waitForTimeout(6000);
}

async function startEditorInputDiagnostics(windowPage: WindowPage) {
  await windowPage.evaluate(() => {
    globalThis.window?.folioleEditorInputDiagnostics?.start();
  });
}

async function attachEditorInputDiagnostics(
  windowPage: WindowPage,
  testInfo: { attach: (name: string, options: { body: string; contentType: string }) => Promise<void> }
) {
  const diagnostics = await windowPage.evaluate(() =>
    globalThis.window?.folioleEditorInputDiagnostics?.exportText?.() ?? null);
  if (!diagnostics) {
    return;
  }
  await testInfo.attach('editor-input-diagnostics', {
    body: diagnostics,
    contentType: 'application/json'
  });
}

async function openNode(windowPage: WindowPage, nodeId: string) {
  const opened = await windowPage.evaluate(async (targetNodeId) => {
    return globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId) ?? false;
  }, nodeId);
  expect(opened).toBe(true);
  await expect
    .poll(() =>
      windowPage.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null))
    .toBe(nodeId);
}

async function setEditorSelection(windowPage: WindowPage, position: number) {
  await expect
    .poll(() =>
      windowPage.evaluate((position) =>
        globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', position, position) ?? false,
      position)
    )
    .toBe(true);
}

async function insertEditorText(windowPage: WindowPage, position: number, text: string) {
  await setEditorSelection(windowPage, position);
  await windowPage.locator('.prompt-editor-host .cm-content').click();
  await windowPage.keyboard.insertText(text);
}

async function waitForEditorContent(windowPage: WindowPage, content: string) {
  await expect
    .poll(() =>
      windowPage.evaluate(() =>
        globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null))
    .toBe(content);
}

async function waitForActiveEditorContent(windowPage: WindowPage, nodeId: string, content: string) {
  await expect
    .poll(() =>
      windowPage.evaluate((targetNodeId) => {
        const workspaceApi = globalThis.window?.__folioleWorkspaceDebug;
        return {
          activeNodeId: workspaceApi?.getActiveNodeId?.() ?? null,
          editorContent: globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null,
          nodeContent: workspaceApi?.getNode?.(targetNodeId)?.content ?? null
        };
      }, nodeId))
    .toEqual({
      activeNodeId: nodeId,
      editorContent: content,
      nodeContent: content
    });
}

async function waitForActiveEditorView(windowPage: WindowPage, nodeId: string, content: string) {
  await expect
    .poll(() =>
      windowPage.evaluate(() => {
        const workspaceApi = globalThis.window?.__folioleWorkspaceDebug;
        return {
          activeNodeId: workspaceApi?.getActiveNodeId?.() ?? null,
          editorContent: globalThis.window?.__folioleDebug?.getEditorContent?.('prompt-editor') ?? null
        };
      }))
    .toEqual({
      activeNodeId: nodeId,
      editorContent: content
    });
}

async function appendToActiveEditor(windowPage: WindowPage, nodeId: string, expectedCurrent: string, text: string) {
  await openNode(windowPage, nodeId);
  await waitForActiveEditorContent(windowPage, nodeId, expectedCurrent);
  await insertEditorText(windowPage, expectedCurrent.length, text);
}

async function createTopicWithContent(windowPage: WindowPage, content: string) {
  const beforeNodeId = await windowPage.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  await windowPage.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  const nodeId = await expect
    .poll(() => windowPage.evaluate((previousNodeId) => {
      const current = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
      return current && current !== previousNodeId ? current : null;
  }, beforeNodeId))
    .not.toBeNull()
    .then(() => windowPage.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null));
  expect(nodeId).toBeTruthy();
  await waitForEditorContent(windowPage, '');
  await insertEditorText(windowPage, 0, content);
  await waitForActiveEditorView(windowPage, nodeId!, content);
  return nodeId!;
}

async function createRandomWorkspace(windowPage: WindowPage) {
  const nodeIds: string[] = [];
  const expected = new Map<string, string>();
  for (let index = 0; index < NODE_COUNT; index += 1) {
    const content = `# Random ${index + 1}\n\nSeed body ${index + 1}`;
    const nodeId = await createTopicWithContent(windowPage, content);
    nodeIds.push(nodeId);
    expected.set(nodeId, content);
    await windowPage.waitForTimeout(250);
  }
  return { expected, nodeIds };
}

async function validateExpectedNodes(windowPage: WindowPage, nodeIds: string[], expected: Map<string, string>) {
  for (const nodeId of nodeIds) {
    await openNode(windowPage, nodeId);
    await waitForActiveEditorContent(windowPage, nodeId, expected.get(nodeId)!);
  }
}

function createAction(rng: () => number, nodeIds: string[], step: number): RandomAction {
  const roll = rng();
  if (roll < 0.48) {
    const nodeId = pick(rng, nodeIds);
    return { kind: 'append', nodeId, text: `\nrandom-${step}-${Math.floor(rng() * 10000)}` };
  }
  if (roll < 0.68) {
    return { kind: 'open', nodeId: pick(rng, nodeIds) };
  }
  if (roll < 0.86) {
    return { kind: 'wait', ms: 120 + Math.floor(rng() * 900) };
  }
  return { kind: 'switchInbox' };
}

test('randomized editor edits survive switches, debounce gaps, and relaunch', async ({ desktopSession, desktopWindow }, testInfo) => {
  const seed = parseSeed();
  const rng = createRng(seed);
  const actions: RandomAction[] = [];
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;

  try {
    await expectWorkspaceShell(desktopWindow);
    await waitForDebugBridge(desktopWindow);
    await startEditorInputDiagnostics(desktopWindow);
    const { expected, nodeIds } = await createRandomWorkspace(desktopWindow);
    let activeExpectedNodeId: string | null = nodeIds.at(-1) ?? null;

    for (let step = 0; step < STEP_COUNT; step += 1) {
      const action = createAction(rng, nodeIds, step);
      actions.push(action);
      if (action.kind === 'append') {
        const current = expected.get(action.nodeId)!;
        await appendToActiveEditor(desktopWindow, action.nodeId, current, action.text);
        const nextContent = `${current}${action.text}`;
        expected.set(action.nodeId, nextContent);
        activeExpectedNodeId = action.nodeId;
        await waitForActiveEditorView(desktopWindow, action.nodeId, nextContent);
      } else if (action.kind === 'open') {
        await openNode(desktopWindow, action.nodeId);
        activeExpectedNodeId = action.nodeId;
        await waitForActiveEditorContent(desktopWindow, action.nodeId, expected.get(action.nodeId)!);
      } else if (action.kind === 'switchInbox') {
        await openNode(desktopWindow, 'special-inbox');
        activeExpectedNodeId = null;
      } else if (action.kind === 'wait') {
        await desktopWindow.waitForTimeout(action.ms);
        if (activeExpectedNodeId) {
          await waitForActiveEditorView(desktopWindow, activeExpectedNodeId, expected.get(activeExpectedNodeId)!);
        }
      }
    }

    await validateExpectedNodes(desktopWindow, nodeIds, expected);
    await openNode(desktopWindow, 'special-inbox');
    await desktopWindow.waitForTimeout(1800);
    await testInfo.attach('editor-random-actions', {
      body: JSON.stringify({ actions, seed }, null, 2),
      contentType: 'application/json'
    });

    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    secondSession = await launchDesktopSession({
      env: {
        ...process.env,
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      }
    });
    await expectWorkspaceShell(secondSession.firstWindow);
    await waitForDebugBridge(secondSession.firstWindow);
    await validateExpectedNodes(secondSession.firstWindow, nodeIds, expected);
  } finally {
    if (!desktopWindow.isClosed()) {
      await attachEditorInputDiagnostics(desktopWindow, testInfo);
    }
    await secondSession?.close();
  }
});
