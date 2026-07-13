/* global Event, HTMLElement, MutationObserver, console, document */

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { launchDesktopSession } from '../desktop/playwright-desktop-harness.mjs';

export const ACTIONS = {
  collapseExpandTree: 'collapse-expand-tree',
  scrollEditor: 'scroll-editor',
  switchNode: 'switch-node',
  toggleRightSidebar: 'toggle-right-sidebar'
};

const DEFAULT_ACTION = ACTIONS.switchNode;
const DEFAULT_SETTLE_MS = 1600;
const TRACE_LIMIT = 12;

const ACTION_THRESHOLDS = {
  [ACTIONS.collapseExpandTree]: {
    documentPanel: 8,
    nodeListTree: 40,
    rightSidebar: 6,
    workspaceGrid: 8
  },
  [ACTIONS.scrollEditor]: {
    documentPanel: 6,
    nodeListTree: 3,
    renderedRowCount: 80,
    rightSidebar: 2,
    workspaceGrid: 2
  },
  [ACTIONS.switchNode]: {
    documentPanel: 18,
    nodeListTree: 10,
    renderedRowCount: 220,
    rightSidebar: 6,
    workspaceGrid: 6
  },
  [ACTIONS.toggleRightSidebar]: {
    documentPanel: 8,
    nodeListTree: 4,
    rightSidebar: 40,
    workspaceGrid: 8
  }
};

function resolvePositiveInteger(rawValue, fallback) {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveArgs(argv) {
  const rawArgs = argv.slice(2);
  let action = DEFAULT_ACTION;
  let json = false;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const value = rawArgs[index]?.trim();
    if (!value) {
      continue;
    }
    if (value === '--json') {
      json = true;
      continue;
    }
    if (value === '--action') {
      const nextValue = rawArgs[index + 1]?.trim();
      if (!nextValue) {
        throw new Error('--action requires a value');
      }
      action = nextValue;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${value}`);
  }

  if (!Object.values(ACTIONS).includes(action)) {
    throw new Error(`unsupported action: ${action}`);
  }

  return {
    action,
    json,
    settleMs: resolvePositiveInteger(process.env.FOLIOLE_RENDER_DIAGNOSTICS_SETTLE_MS, DEFAULT_SETTLE_MS)
  };
}

async function prepareSession(page) {
  await page.waitForTimeout(150);
}

async function seedNodesForSwitch(page) {
  await page.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: '# Render Switch A\n\nShort document used to test node switching diagnostics.',
        id: 'render-diag-switch-a',
        kind: 'topic',
        title: 'Render Diag Switch A'
      },
      {
        content: '# Render Switch B\n\nSecond short document used to test node switching diagnostics.',
        id: 'render-diag-switch-b',
        kind: 'topic',
        title: 'Render Diag Switch B'
      }
    ]);
    await api?.openNode?.('render-diag-switch-a');
  });
}

async function seedNodesForScroll(page) {
  await page.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    const lines = Array.from(
      { length: 320 },
      (_, index) => `Render diagnostics line ${index + 1} keeps this document long enough to scroll meaningfully.`
    );
    await api?.seedNodes?.([
      {
        content: `# Render Scroll Long\n\n${lines.join('\n')}`,
        id: 'render-diag-scroll-long',
        kind: 'topic',
        title: 'Render Diag Scroll Long'
      },
      {
        content: '# Render Scroll Pivot\n\nPivot node used to leave and return when needed.',
        id: 'render-diag-scroll-pivot',
        kind: 'topic',
        title: 'Render Diag Scroll Pivot'
      }
    ]);
    await api?.openNode?.('render-diag-scroll-long');
  });
}

async function seedNodesForTree(page) {
  await page.evaluate(async () => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: '',
        id: 'render-diag-folder',
        kind: 'folder',
        title: 'Render Diag Folder'
      },
      {
        content: '# Render Tree Child A\n\nFirst tree child',
        id: 'render-diag-folder-child-a',
        kind: 'topic',
        parentNodeId: 'render-diag-folder',
        title: 'Render Diag Folder Child A'
      },
      {
        content: '# Render Tree Child B\n\nSecond tree child',
        id: 'render-diag-folder-child-b',
        kind: 'topic',
        parentNodeId: 'render-diag-folder',
        title: 'Render Diag Folder Child B'
      }
    ]);
    await api?.openNode?.('render-diag-folder-child-a');
  });
}

async function resetDiagnostics(page) {
  await page.evaluate(() => {
    globalThis.window?.__foliolePerformanceDebug?.reset?.();
    globalThis.window?.__folioleDebug?.clearTraces?.();
  });
}

async function collectSnapshot(page) {
  return page.evaluate(() => {
    const performanceApi = globalThis.window?.__foliolePerformanceDebug;
    const debugApi = globalThis.window?.__folioleDebug;
    const workspaceApi = globalThis.window?.__folioleWorkspaceDebug;
    return {
      flow: performanceApi?.getSnapshot?.()?.flow ?? null,
      totals: performanceApi?.getSnapshot?.()?.accumulatedComponentRenderCounts ?? null,
      traces: debugApi?.getTraces?.() ?? [],
      viewState: workspaceApi?.getActiveNodeId?.()
        ? workspaceApi?.getNodeViewState?.(workspaceApi.getActiveNodeId()) ?? null
        : null
    };
  });
}

async function captureDomMutationAction(page, action, settleMs) {
  return page.evaluate(
    async ({ actionName, waitMs }) => {
      const selectors = {
        documentPanel: '[aria-label="Document area"]',
        nodeListTree: '[aria-label="Topic list panel"]',
        rightSidebar: '[aria-label="Inspector"]',
        workspaceGrid: '#root'
      };
      const counts = {
        documentPanel: 0,
        nodeListTree: 0,
        rightSidebar: 0,
        workspaceGrid: 0
      };
      const getTreeExpandedCount = () =>
        Array.from(document.querySelectorAll('[role="treeitem"][aria-expanded="true"]')).length;

      const observers = Object.entries(selectors)
        .map(([key, selector]) => {
          const target = document.querySelector(selector);
          if (!(target instanceof HTMLElement)) {
            return null;
          }
          const observer = new MutationObserver((records) => {
            counts[key] += records.length;
          });
          observer.observe(target, {
            attributes: true,
            characterData: true,
            childList: true,
            subtree: true
          });
          return observer;
        })
        .filter(Boolean);

      const before = {
        rightSidebarVisible: Boolean(document.querySelector(selectors.rightSidebar)),
        treeExpandedCount: getTreeExpandedCount()
      };

      if (actionName === 'toggle-right-sidebar') {
        const toggleButton = document.querySelector('[aria-label="Toggle right sidebar"]');
        if (!(toggleButton instanceof HTMLElement)) {
          throw new Error('missing right sidebar toggle button');
        }
        toggleButton.click();
      } else if (actionName === 'collapse-expand-tree') {
        const collapseButton = document.querySelector('[aria-label="Collapse Render Diag Folder"]');
        if (!(collapseButton instanceof HTMLElement)) {
          throw new Error('missing folder collapse button');
        }
        collapseButton.click();
        await new Promise((resolve) => globalThis.setTimeout(resolve, 180));
        const expandButton = document.querySelector('[aria-label="Expand Render Diag Folder"]');
        if (!(expandButton instanceof HTMLElement)) {
          throw new Error('missing folder expand button');
        }
        expandButton.click();
      } else {
        throw new Error(`unsupported dom action: ${actionName}`);
      }

      await new Promise((resolve) => globalThis.setTimeout(resolve, waitMs));
      for (const observer of observers) {
        observer?.disconnect();
      }

      return {
        before,
        counts,
        state: {
          rightSidebarVisible: Boolean(document.querySelector(selectors.rightSidebar)),
          treeExpandedCount: getTreeExpandedCount()
        }
      };
    },
    { actionName: action, waitMs: settleMs }
  );
}

async function runSwitchNodeAction(page, settleMs) {
  await seedNodesForSwitch(page);
  await page.waitForTimeout(350);
  await resetDiagnostics(page);
  await page.evaluate(async () => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.('render-diag-switch-b');
  });
  await page.waitForTimeout(settleMs);
  return collectSnapshot(page);
}

async function runScrollEditorAction(page, settleMs) {
  await seedNodesForScroll(page);
  await page.waitForSelector('.prompt-editor-host .cm-scroller', { state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(350);
  await resetDiagnostics(page);
  await page.evaluate(async () => {
    const scroller = document.querySelector('.prompt-editor-host .cm-scroller');
    if (!(scroller instanceof HTMLElement)) {
      throw new Error('missing prompt editor scroller');
    }
    scroller.scrollTop = Math.max(0, scroller.scrollHeight * 0.72);
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1200));
  });
  await page.waitForTimeout(settleMs);
  return collectSnapshot(page);
}

async function runToggleRightSidebarAction(page, settleMs) {
  await page.waitForSelector('[aria-label="Toggle right sidebar"]', { state: 'visible', timeout: 15_000 });
  return captureDomMutationAction(page, ACTIONS.toggleRightSidebar, settleMs);
}

async function runCollapseExpandTreeAction(page, settleMs) {
  await seedNodesForTree(page);
  await page.waitForSelector('[aria-label="Collapse Render Diag Folder"]', { state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(300);
  return captureDomMutationAction(page, ACTIONS.collapseExpandTree, settleMs);
}

export async function collectRenderActionSnapshot(page, action, settleMs) {
  if (action === ACTIONS.scrollEditor) {
    return runScrollEditorAction(page, settleMs);
  }
  if (action === ACTIONS.toggleRightSidebar) {
    return runToggleRightSidebarAction(page, settleMs);
  }
  if (action === ACTIONS.collapseExpandTree) {
    return runCollapseExpandTreeAction(page, settleMs);
  }
  return runSwitchNodeAction(page, settleMs);
}

function selectInterestingTraces(action, traces) {
  const keywords =
    action === ACTIONS.scrollEditor
      ? ['reading-progress.capture-scroll', 'reading-progress.debounce', 'editor.viewport']
      : action === ACTIONS.toggleRightSidebar || action === ACTIONS.collapseExpandTree
        ? []
      : ['selection_', 'document_', 'node_cache_', 'position_'];

  return traces
    .filter((entry) => keywords.some((keyword) => entry.event.includes(keyword)))
    .slice(-TRACE_LIMIT);
}

export function analyzeActionResult(action, snapshot) {
  const flow = snapshot?.flow ?? null;
  const totals =
    snapshot?.totals ??
    snapshot?.counts ??
    flow?.componentRenderCounts ?? {
      documentPanel: 0,
      nodeListTree: 0,
      rightSidebar: 0,
      workspaceGrid: 0
    };
  const thresholds = ACTION_THRESHOLDS[action];
  const suspicious = [];

  if (totals.workspaceGrid > thresholds.workspaceGrid) {
    suspicious.push(`main workspace refreshed ${totals.workspaceGrid} times`);
  }
  if (totals.nodeListTree > thresholds.nodeListTree) {
    suspicious.push(`node list refreshed ${totals.nodeListTree} times`);
  }
  if (totals.rightSidebar > thresholds.rightSidebar) {
    suspicious.push(`right sidebar refreshed ${totals.rightSidebar} times`);
  }
  if (totals.documentPanel > thresholds.documentPanel) {
    suspicious.push(`document panel refreshed ${totals.documentPanel} times`);
  }
  if (thresholds.renderedRowCount != null && (flow?.renderedRowCount ?? 0) > thresholds.renderedRowCount) {
    suspicious.push(`node rows re-rendered ${flow.renderedRowCount} times`);
  }

  const interestingTraces = selectInterestingTraces(action, snapshot?.traces ?? []);

  return {
    action,
    countSource: snapshot?.totals ? 'accumulated' : snapshot?.counts ? 'dom-mutations' : flow?.componentRenderCounts ? 'current-flow' : 'traces-only',
    domState: snapshot?.state ?? null,
    domStateBefore: snapshot?.before ?? null,
    interestingTraces,
    suspicious,
    totals,
    verdict: suspicious.length === 0 ? 'quiet' : 'suspicious',
    viewState: snapshot?.viewState ?? null
  };
}

export function formatActionReport(result) {
  const title =
    result.action === ACTIONS.scrollEditor
      ? 'Scroll editor'
      : result.action === ACTIONS.toggleRightSidebar
        ? 'Toggle right sidebar'
        : result.action === ACTIONS.collapseExpandTree
          ? 'Collapse and expand tree'
          : 'Switch node';
  const lines = [
    `Action: ${title}`,
    `Verdict: ${result.verdict === 'quiet' ? 'looks quiet' : 'suspicious refresh detected'}`,
    `Counts (${result.countSource}): workspace ${result.totals.workspaceGrid}, node list ${result.totals.nodeListTree}, document ${result.totals.documentPanel}, right sidebar ${result.totals.rightSidebar}`
  ];

  if (result.suspicious.length > 0) {
    lines.push('Suspicious areas:');
    for (const item of result.suspicious) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push('Suspicious areas: none');
  }

  if (result.viewState?.scrollTop != null) {
    lines.push(`Captured scrollTop: ${Math.round(result.viewState.scrollTop)}`);
  }

  if (result.domState) {
    lines.push(
      `State: sidebar ${result.domState.rightSidebarVisible ? 'visible' : 'hidden'}, expanded tree rows ${result.domState.treeExpandedCount}`
    );
  }

  if (result.interestingTraces.length > 0) {
    lines.push('Trace highlights:');
    for (const trace of result.interestingTraces) {
      lines.push(`- ${trace.event}`);
    }
  }

  return lines.join('\n');
}

export async function runRenderActionDiagnostics(options = {}) {
  const args = options.args ?? resolveArgs(process.argv);
  const session = await launchDesktopSession();

  try {
    await prepareSession(session.firstWindow);
    const snapshot = await collectRenderActionSnapshot(session.firstWindow, args.action, args.settleMs);
    const result = analyzeActionResult(args.action, snapshot);
    return {
      collectedAt: new Date().toISOString(),
      raw: snapshot,
      report: formatActionReport(result),
      result
    };
  } finally {
    await session.close();
  }
}

export async function main() {
  const output = await runRenderActionDiagnostics();
  if (resolveArgs(process.argv).json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(output.report);
}

const directExecutionArg = process.argv[1];
if (directExecutionArg && import.meta.url === pathToFileURL(directExecutionArg).href) {
  await main();
}
