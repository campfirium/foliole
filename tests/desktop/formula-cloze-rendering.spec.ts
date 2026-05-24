import { expect, test } from './harness/fixtures';
import {
  collectFormulaRegionState,
  dragFirstFormulaRowLeftRegion,
  dragFormulaClozeRegion,
  findFormulaClozeChildId,
  FORMULA,
  MULTILINE_FORMULA,
  seedFormulaClozeWorkspace
} from './harness/formulaCloze';
import { expectWorkspaceShell } from './harness/settings';

async function openSeededFormulaParent(desktopWindow: Parameters<typeof seedFormulaClozeWorkspace>[0]) {
  await expectWorkspaceShell(desktopWindow);
  await seedFormulaClozeWorkspace(desktopWindow);
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
  await expect(desktopWindow.getByRole('button', { name: 'Formula Cloze Child', exact: true })).toBeVisible();
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
  await desktopWindow.evaluate(async ({ formula }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{ content: formula, id: 'playwright-formula-drag-parent', kind: 'topic', title: 'Formula Drag Parent' }]);
    await api?.openNode?.('playwright-formula-drag-parent');
  }, { formula: FORMULA });

  await dragFormulaClozeRegion(desktopWindow);
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
  await desktopWindow.evaluate(async (nodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(nodeId!);
  }, childId);
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
  await desktopWindow.evaluate(async ({ formula }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([{ content: formula, id: 'playwright-formula-drag-parent', kind: 'topic', title: 'Multiline Formula Parent' }]);
    await api?.openNode?.('playwright-formula-drag-parent');
  }, { formula: MULTILINE_FORMULA });

  const widgetHeight = await dragFirstFormulaRowLeftRegion(desktopWindow);
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
  await desktopWindow.evaluate(async (nodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(nodeId!);
  }, childId);
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
