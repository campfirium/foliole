import { expect, test } from './harness/fixtures';
import {
  collectFormulaClozeDebugState,
  collectFormulaRegionState,
  dragFirstFormulaRowLeftRegion,
  dragFormulaClozeRegion,
  findFormulaClozeChildId,
  FORMULA,
  installFormulaClozeCreateEventCounter,
  MULTILINE_FORMULA,
  readFormulaClozeCreateEventCount,
  seedFormulaClozeWorkspace
} from './harness/formulaCloze';
import { expectWorkspaceShell } from './harness/settings';

async function openSeededFormulaParent(desktopWindow: Parameters<typeof seedFormulaClozeWorkspace>[0]) {
  await expectWorkspaceShell(desktopWindow);
  await seedFormulaClozeWorkspace(desktopWindow);
}

async function seedAndOpenFormulaDragParent(
  desktopWindow: Parameters<typeof seedFormulaClozeWorkspace>[0],
  formula: string,
  title: string
) {
  await desktopWindow.evaluate(async ({ formula: sourceFormula, title: nodeTitle }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: sourceFormula, id: 'playwright-formula-drag-parent', kind: 'topic', title: nodeTitle }
    ]);
    await api?.openNode?.('playwright-formula-drag-parent');
  }, { formula, title });
  await expect.poll(() => desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null))
    .toBe('playwright-formula-drag-parent');
}

async function openFormulaClozeChild(
  desktopWindow: Parameters<typeof seedFormulaClozeWorkspace>[0],
  childId: string | null
) {
  await desktopWindow.evaluate(async (nodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(nodeId!);
  }, childId);
  await expect.poll(() => desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null))
    .toBe(childId);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-formula-cloze-region')).toHaveCount(1);
}

test('renders formula cloze outline on the parent and mask on the child', async ({ desktopWindow }, testInfo) => {
  await openSeededFormulaParent(desktopWindow);

  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-formula-cloze-region')).toHaveCount(1);
  const parentState = await collectFormulaRegionState(desktopWindow);
  expect(parentState.outlined).toBe('true');
  expect(parentState.hidden).toBe('false');
  expect(parentState.width).toBeGreaterThan(8);
  expect(parentState.height).toBeGreaterThan(8);

  await desktopWindow.evaluate(async () => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.('playwright-formula-child');
  });
  await expect.poll(() => desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null))
    .toBe('playwright-formula-child');
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-formula-cloze-region')).toHaveCount(1);
  const childState = await collectFormulaRegionState(desktopWindow);
  await testInfo.attach('formula-cloze-region-state', {
    body: JSON.stringify({ childState, parentState }, null, 2),
    contentType: 'application/json'
  });

  expect(childState.hidden).toBe('true');
  expect(childState.outlined).toBe('false');
  expect(childState.opacity).toBe('1');
  expect(childState.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(childState.width).toBeGreaterThan(8);
  expect(childState.height).toBeGreaterThan(8);
});

test('creates a formula cloze by dragging on the rendered formula and shows the mask', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedAndOpenFormulaDragParent(desktopWindow, FORMULA, 'Formula Drag Parent');

  await installFormulaClozeCreateEventCounter(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.('playwright-formula-drag-parent');
  });
  await expect.poll(() => desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null))
    .toBe('playwright-formula-drag-parent');
  await dragFormulaClozeRegion(desktopWindow);
  const createEventCount = await readFormulaClozeCreateEventCount(desktopWindow);
  await testInfo.attach('formula-cloze-create-event-count', {
    body: String(createEventCount),
    contentType: 'text/plain'
  });
  await testInfo.attach('formula-cloze-debug-state-after-drag', {
    body: JSON.stringify(await collectFormulaClozeDebugState(desktopWindow), null, 2),
    contentType: 'application/json'
  });
  await expect.poll(() => findFormulaClozeChildId(desktopWindow)).not.toBeNull();
  const parentState = await collectFormulaRegionState(desktopWindow);
  await testInfo.attach('formula-cloze-created-parent-state', {
    body: JSON.stringify({ parentState }, null, 2),
    contentType: 'application/json'
  });
  expect(parentState.outlined).toBe('true');
  expect(parentState.width).toBeGreaterThan(8);
  expect(parentState.height).toBeGreaterThan(8);

  const childId = await findFormulaClozeChildId(desktopWindow);
  await openFormulaClozeChild(desktopWindow, childId);
  const childState = await collectFormulaRegionState(desktopWindow);
  await testInfo.attach('formula-cloze-drag-state', {
    body: JSON.stringify({ childId, childState, parentState }, null, 2),
    contentType: 'application/json'
  });

  expect(childState.hidden).toBe('true');
  expect(childState.opacity).toBe('1');
  expect(childState.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(childState.width).toBeGreaterThan(8);
  expect(childState.height).toBeGreaterThan(8);
});

test('creates a row-sized formula cloze when dragging only one row of a multiline formula', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await seedAndOpenFormulaDragParent(desktopWindow, MULTILINE_FORMULA, 'Multiline Formula Parent');

  await installFormulaClozeCreateEventCounter(desktopWindow);
  await desktopWindow.evaluate(async () => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.('playwright-formula-drag-parent');
  });
  await expect.poll(() => desktopWindow.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null))
    .toBe('playwright-formula-drag-parent');
  const widgetHeight = await dragFirstFormulaRowLeftRegion(desktopWindow);
  const createEventCount = await readFormulaClozeCreateEventCount(desktopWindow);
  await testInfo.attach('formula-cloze-multiline-create-event-count', {
    body: String(createEventCount),
    contentType: 'text/plain'
  });
  await testInfo.attach('formula-cloze-multiline-debug-state-after-drag', {
    body: JSON.stringify(await collectFormulaClozeDebugState(desktopWindow), null, 2),
    contentType: 'application/json'
  });
  await expect.poll(() => findFormulaClozeChildId(desktopWindow)).not.toBeNull();
  const parentState = await collectFormulaRegionState(desktopWindow);
  await testInfo.attach('formula-cloze-multiline-parent-state', {
    body: JSON.stringify({ parentState, widgetHeight }, null, 2),
    contentType: 'application/json'
  });
  expect(parentState.outlined).toBe('true');
  expect(parentState.height).toBeGreaterThan(8);
  expect(parentState.height).toBeLessThan(widgetHeight * 0.72);

  const childId = await findFormulaClozeChildId(desktopWindow);
  await openFormulaClozeChild(desktopWindow, childId);
  const childState = await collectFormulaRegionState(desktopWindow);
  await testInfo.attach('formula-cloze-multiline-child-state', {
    body: JSON.stringify({ childId, childState, widgetHeight }, null, 2),
    contentType: 'application/json'
  });

  expect(childState.hidden).toBe('true');
  expect(childState.opacity).toBe('1');
  expect(childState.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(childState.height).toBeLessThan(widgetHeight * 0.72);
});
