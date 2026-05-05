import {
  ACTIONS,
  analyzeActionResult,
  collectRenderActionSnapshot,
  formatActionReport
} from '../../scripts/windows/collect-render-action-diagnostics.mjs';
import { expect, test } from '../desktop/harness/fixtures';
import { expectWorkspaceShell } from '../desktop/harness/settings';

async function attachActionReport(testInfo: Parameters<typeof test>[1], name: string, payload: unknown) {
  await testInfo.attach(name, {
    body: JSON.stringify(payload, null, 2),
    contentType: 'application/json'
  });
}

test('collects render diagnostics for switch-node action', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  const snapshot = await collectRenderActionSnapshot(desktopWindow, ACTIONS.switchNode, 1600);
  const result = analyzeActionResult(ACTIONS.switchNode, snapshot);
  const report = formatActionReport(result);

  await attachActionReport(testInfo, 'render-diagnostics-switch-node', {
    report,
    result,
    snapshot
  });

  console.log(report);
  expect(report).toContain('Action: Switch node');
});

test('collects render diagnostics for scroll-editor action', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  const snapshot = await collectRenderActionSnapshot(desktopWindow, ACTIONS.scrollEditor, 1600);
  const result = analyzeActionResult(ACTIONS.scrollEditor, snapshot);
  const report = formatActionReport(result);

  await attachActionReport(testInfo, 'render-diagnostics-scroll-editor', {
    report,
    result,
    snapshot
  });

  console.log(report);
  expect(snapshot.viewState?.scrollTop ?? 0).toBeGreaterThan(0);
});

test('collects render diagnostics for toggle-right-sidebar action', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  const snapshot = await collectRenderActionSnapshot(desktopWindow, ACTIONS.toggleRightSidebar, 1200);
  const result = analyzeActionResult(ACTIONS.toggleRightSidebar, snapshot);
  const report = formatActionReport(result);

  await attachActionReport(testInfo, 'render-diagnostics-toggle-right-sidebar', {
    report,
    result,
    snapshot
  });

  console.log(report);
  expect(report).toContain('Action: Toggle right sidebar');
});

test('collects render diagnostics for collapse-expand-tree action', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);

  const snapshot = await collectRenderActionSnapshot(desktopWindow, ACTIONS.collapseExpandTree, 1200);
  const result = analyzeActionResult(ACTIONS.collapseExpandTree, snapshot);
  const report = formatActionReport(result);

  await attachActionReport(testInfo, 'render-diagnostics-collapse-expand-tree', {
    report,
    result,
    snapshot
  });

  console.log(report);
  expect(report).toContain('Action: Collapse and expand tree');
});
