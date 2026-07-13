/* global console, document, window */

import process from 'node:process';

import { launchDesktopSession } from '../desktop/playwright-desktop-harness.mjs';

const DEFAULT_SAMPLE_COUNT = 5;
const DEFAULT_SETTLE_TIMEOUT_MS = 15000;

function resolvePositiveInteger(rawValue, fallback) {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

const SAMPLE_COUNT = resolvePositiveInteger(process.env.FOLIOLE_NODE_FLOW_SAMPLE_COUNT, DEFAULT_SAMPLE_COUNT);
const SETTLE_TIMEOUT_MS = resolvePositiveInteger(
  process.env.FOLIOLE_NODE_FLOW_SETTLE_TIMEOUT_MS,
  DEFAULT_SETTLE_TIMEOUT_MS
);

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveArgs(argv) {
  const rawArgs = argv.slice(2).map((value) => value.trim()).filter(Boolean);
  const seedFixture = rawArgs.includes('--seed-fixture');
  const titles = rawArgs.filter((value) => value !== '--seed-fixture');
  return { seedFixture, titles };
}

async function resetPerformanceSnapshot(page) {
  await page.evaluate(() => {
    (window).__foliolePerformanceDebug?.reset();
  });
}

async function seedDiagnosticNodes(page) {
  const diagnosticNodes = [
    { content: '# Pivot\n\nUse this node to bounce between diagnostics.', id: 'diag-pivot', title: 'Diag Pivot' },
    { content: '', id: 'diag-empty', title: 'Diag Empty' },
    { content: '# Diag Short\n\n1231231231231231111112332323赛风费弗森asdf', id: 'diag-short', title: 'Diag Short' },
    {
      content: '# Diag Medium\n\nThis is a medium node.\n\nIt has enough text to avoid the empty-node path.',
      id: 'diag-medium',
      title: 'Diag Medium'
    }
  ];
  await page.evaluate((nodes) => {
    (window).__folioleWorkspaceDebug?.seedNodes(nodes);
  }, diagnosticNodes);
  await page.waitForTimeout(250);
  return diagnosticNodes.map((node) => node.title);
}

async function readPerformanceSnapshot(page) {
  return page.evaluate(() => {
    return (window).__foliolePerformanceDebug?.getSnapshot() ?? null;
  });
}

async function listKnownNodes(page) {
  return page.evaluate(() => {
    const debugNodes = (window).__folioleWorkspaceDebug?.listNodes?.();
    if (Array.isArray(debugNodes) && debugNodes.length > 0) {
      return debugNodes.map((node) => ({
        id: node.id,
        title: String(node.title ?? '').trim()
      }));
    }
    return Array.from(document.querySelectorAll('[role="treeitem"]'))
      .map((element) => ({ id: '', title: (element.textContent ?? '').trim() }))
      .filter((node) => node.title.length > 0);
  });
}

async function clickNodeByTitle(page, title) {
  const node = page.locator('[role="treeitem"]').filter({ hasText: title }).first();
  await node.scrollIntoViewIfNeeded();
  await node.click();
}

async function openNodeByTitle(page, title) {
  try {
    await clickNodeByTitle(page, title);
    return;
  } catch {
    const openedViaDebugBridge = await page.evaluate(async (targetTitle) => {
      const api = (window).__folioleWorkspaceDebug;
      if (!api?.listNodes || !api?.openNode) {
        return false;
      }
      const targetNode = api.listNodes().find((node) => String(node.title ?? '').trim() === targetTitle);
      if (!targetNode) {
        return false;
      }
      return await api.openNode(targetNode.id);
    }, title);
    if (openedViaDebugBridge) {
      return;
    }
    throw new Error(`unable to open node "${title}"`);
  }
}

async function clickPivotNode(page, excludedTitle) {
  const knownNodes = await listKnownNodes(page);
  const pivotTitle = knownNodes.find((node) => node.title !== excludedTitle)?.title;
  if (!pivotTitle) {
    throw new Error(`unable to resolve pivot node while excluding "${excludedTitle}"`);
  }
  await openNodeByTitle(page, pivotTitle);
  await page.waitForTimeout(150);
}

async function waitForFlowToSettle(page, title) {
  const titlePattern = new RegExp(escapeForRegExp(title));
  await page.waitForFunction(
    ({ titlePatternSource }) => {
      const snapshot = (window).__foliolePerformanceDebug?.getSnapshot?.();
      if (!snapshot?.flow) {
        return false;
      }
      const flow = snapshot.flow;
      const titlePattern = new RegExp(titlePatternSource);
      const titleMatched = typeof flow.nodeTitle === 'string' && titlePattern.test(flow.nodeTitle);
      if (!titleMatched) {
        return false;
      }
      return flow.bodyReadyDurationMs !== null;
    },
    { titlePatternSource: titlePattern.source },
    { timeout: SETTLE_TIMEOUT_MS }
  );
}

async function sampleNodeFlow(page, title) {
  const samples = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    console.error(`[collect-node-flow] ${title}: sample ${index + 1}/${SAMPLE_COUNT} starting`);
    await clickPivotNode(page, title);
    await resetPerformanceSnapshot(page);
    await openNodeByTitle(page, title);
    try {
      await waitForFlowToSettle(page, title);
    } catch (error) {
      const snapshot = await readPerformanceSnapshot(page);
      throw new Error(
        `flow did not settle for "${title}" on sample ${index + 1}: ${JSON.stringify(snapshot?.flow ?? null, null, 2)}`,
        { cause: error }
      );
    }
    await page.waitForTimeout(120);
    const snapshot = await readPerformanceSnapshot(page);
    samples.push(snapshot?.flow ?? null);
    console.error(`[collect-node-flow] ${title}: sample ${index + 1}/${SAMPLE_COUNT} captured`);
  }
  return samples;
}

function summarizeSamples(samples) {
  const validSamples = samples.filter(Boolean);
  const average = (key) => {
    const values = validSamples
      .map((sample) => sample[key])
      .filter((value) => typeof value === 'number');
    if (values.length === 0) {
      return null;
    }
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  };

  return {
    avgBodyReadyMs: average('bodyReadyDurationMs'),
    avgBodyPaintMs: average('bodyPaintDurationMs'),
    avgDocumentPanelRenders: averageFromNested('componentRenderCounts', 'documentPanel', validSamples),
    avgDocumentLoadMs: average('documentLoadDurationMs'),
    avgDocumentLoadStartMs: average('documentLoadStartDurationMs'),
    avgNodeListTreeRenders: averageFromNested('componentRenderCounts', 'nodeListTree', validSamples),
    avgOverallMs: average('overallReadyDurationMs'),
    avgPanelBoundMs: average('panelBoundDurationMs'),
    avgRealContentReadyMs: average('realContentReadyDurationMs'),
    avgRealReadyMs: average('realReadyDurationMs'),
    avgRenderedRowCount: average('renderedRowCount'),
    avgRenderedRowUniqueCount: average('renderedRowUniqueCount'),
    avgRequestToApplyMs: average('requestToApplyDurationMs'),
    avgRightSidebarRenders: averageFromNested('componentRenderCounts', 'rightSidebar', validSamples),
    avgWorkspaceGridRenders: averageFromNested('componentRenderCounts', 'workspaceGrid', validSamples),
    samples: validSamples.length
  };
}

function averageFromNested(rootKey, key, validSamples) {
  const values = validSamples
    .map((sample) => sample[rootKey]?.[key])
    .filter((value) => typeof value === 'number');
  if (values.length === 0) {
    return null;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function main() {
  const { seedFixture, titles: requestedTitles } = resolveArgs(process.argv);
  console.error('[collect-node-flow] launching desktop session');
  const session = await launchDesktopSession();

  try {
    let titles = requestedTitles;
    if (seedFixture) {
      console.error('[collect-node-flow] seeding diagnostic fixture');
      titles = await seedDiagnosticNodes(session.firstWindow);
    }
    if (titles.length === 0) {
      const visibleTitles = (await listKnownNodes(session.firstWindow)).map((node) => node.title);
      throw new Error(
        `no node titles provided; pass titles as arguments or use --seed-fixture. visible nodes: ${visibleTitles.slice(0, 20).join(' | ')}`
      );
    }
    const results = [];
    for (const title of titles) {
      console.error(`[collect-node-flow] collecting "${title}"`);
      const samples = await sampleNodeFlow(session.firstWindow, title);
      results.push({
        summary: summarizeSamples(samples),
        title,
        timelineSamples: samples
      });
      console.error(`[collect-node-flow] collected "${title}"`);
    }
    console.log(JSON.stringify({ collectedAt: new Date().toISOString(), results }, null, 2));
  } finally {
    console.error('[collect-node-flow] closing desktop session');
    await session.close();
  }
}

await main();
