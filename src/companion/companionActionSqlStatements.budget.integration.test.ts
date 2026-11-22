// @vitest-environment node
import { writeFileSync } from 'node:fs';

import { afterEach, expect, it, vi } from 'vitest';

import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { DIVE_NODE_FILTER } from '../../lib/core/nodes/dive';
import { createManualVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { saveLocalCurrentParentOrderWithDbPort } from '../../lib/core/sync/currentParentOrderStore';
import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { convertCompanionDiveDirectory } from '../shared/platform/companion/runtime/companionDiveConversion';
import { addCompanionDiveSource, removeCompanionDiveSources } from '../shared/platform/companion/runtime/companionDiveSources';
import { replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { changeCompanionIndexSource } from '../shared/platform/companion/runtime/companionIndexSources';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { moveCompanionBatch } from '../shared/platform/companion/runtime/companionWorkspaceBatchMove';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { moveCompanionBatchToTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { saveCompanionSyncNodeReadingRecord, saveCompanionSyncNodeViewState } from '../shared/platform/companionSyncStateWriters';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';
import { persistFlowMutation } from './companionFlowMutation';

// Statement budget for everyday phone actions. On the phone every statement is one Capacitor bridge round trip
// (about 5–10 ms on a Redmi N12), so a small action that issues dozens of statements is slow however small its
// reads are. Row and whole-library counts live in the *.workAmplification tests; this file counts round trips.
// Method and audit: .lab/atlas/8performance/work-amplification-checks.md, section "单个动作的 SQL 语句数审计".
// FOLIOLE_SQL_BUDGET_REPORT=<file> writes every counted statement with its callers, for audits;
// FOLIOLE_SQL_BUDGET_STRICT=1 applies the budgets alone, as they will apply once WA-057 is fixed.

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

type Statement = { sql: string; method: string; callers: string[] };
type Phase = 'write' | 'refresh';
const recorded: Record<Phase, Statement[]> = { write: [], refresh: [] };
let phase: Phase | null = null;
const originalBegin = sqlRecording.begin.bind(sqlRecording);
sqlRecording.begin = (sql: string, method: string, host: string) => {
  if (phase) {
    const callers = (new Error().stack ?? '').split('\n').slice(1)
      .filter(line => /\/(src|lib)\//u.test(line))
      .filter(line => !/sqlRecording|capacitorSqliteDbPort|DbPort|companionEditHistorySession|\.budget\.integration|node_modules/u.test(line))
      .map(line => line.trim().replace(/^at /u, '').replace(/\(?\/.*?\/(src|lib)\//u, '$1/').replace(/\)$/u, ''))
      .slice(0, 4);
    recorded[phase].push({ sql: sql.replace(/\s+/gu, ' ').trim(), method, callers });
  }
  return originalBegin(sql, method, host);
};

let library: Awaited<ReturnType<typeof createSearchLibrary>> | null = null;
afterEach(async () => { await library?.close(); library = null; });

async function openWorkspace() {
  library = await createSearchLibrary(100, 16);
  library.database.prepare("INSERT INTO nodes (id,kind,title,content,created_at,updated_at) VALUES ('bulk','folder','bulk','','0','0')").run();
  library.database.prepare("UPDATE nodes SET parent_id = 'bulk' WHERE parent_id IS NULL AND id NOT LIKE 'special-%' AND id != 'bulk'").run();
  for (const id of ['folder', 'other']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'folder', parentNodeId: null, title: id });
  for (const id of ['a', 'b', 'c', 'gone', 'shelved']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId: 'folder', title: id });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'ax', kind: 'item', parentNodeId: 'a', title: 'ax' });
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'gone' });
  await mutateCompanionWorkspace({ type: 'shelve', nodeId: 'shelved' });
  await mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive', title: 'dive', sourceId: 'b' });
  await mutateCompanionWorkspace({ type: 'create-index', nodeId: 'index', title: 'index' });
  await changeCompanionIndexSource('index', 'c', 'add');
  await writeIosCompanionDatabase(db => saveLocalCurrentParentOrderWithDbPort(db, { parentId: 'folder',
    childIds: ['c', 'a', 'gone', 'b', 'shelved'], now: '2026-11-21T00:00:00.000Z', hostName: 'Search' }), { kind: 'business' });
  await refreshCompanionWorkspaceAfterMutation(null);
}

const flowNow = '2026-10-25T08:00:00.000Z';
async function openReviewFlow(mode: 'review-first' | 'reading-only') {
  library = await createSearchLibrary(0);
  await seedCompanionReviewHistory({ due: '2026-10-01T00:00:00.000Z', lastReviewAt: '2026-09-28T00:00:00.000Z',
    state: 2, stability: 3, difficulty: 4, elapsedDays: 3, scheduledDays: 3, reps: 2, lapses: 0 }, flowNow,
  ['a', 'b', 'c'], mode === 'review-first' ? 'item' : 'topic');
  const session = (await openCompanionDailyFlow({ now: flowNow, mode })).session;
  if (!session.currentNodeId) throw new Error('flow_without_current_node');
  return { ...session, isAnswerRevealed: true };
}
const workspaceSnapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;

const replayMove = (mode: 'undo' | 'redo') => async () => {
  await mutateCompanionWorkspace({ type: 'move', nodeId: 'a', parentNodeId: 'other' });
  const history = companionFlowHistoryKey('Search');
  if (mode === 'redo') await replayCompanionFlowHistory(history, 'undo', createEmptyReviewSession());
  await refreshCompanionWorkspaceAfterMutation();
  return () => replayCompanionFlowHistory(history, mode, createEmptyReviewSession());
};

async function currentVersions(ids: string[]) {
  const snapshot = (await refreshCompanionWorkspaceAfterMutation())!;
  return ids.map(id => ({ id, version: snapshot.nodesById[id]!.currentVersionId! }));
}

type Action = {
  // Write and refresh budgets: statements, i.e. bridge round trips. Keep a small margin over the audited count.
  budget: { write: number; refresh: number };
  // The current count while a recorded WA item keeps the action over budget. The check then holds the count at
  // this ceiling and expects the budget to be broken, so a fix or a regression both show up here.
  overBudget?: { wa: string; write: number; refresh: number };
  run: () => Promise<{ refresh: () => Promise<unknown> }>;
};

const workspace = (write: () => Promise<unknown>, prepare?: () => Promise<() => Promise<unknown>>) => async () => {
  await openWorkspace();
  const run = prepare ? await prepare() : write;
  phase = 'write';
  await run();
  return { refresh: () => refreshCompanionWorkspaceAfterMutation() };
};

const ACTIONS: Record<string, Action> = {
  rename: { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 51, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'rename', nodeId: 'a', title: 'Renamed' })) },
  move: { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 53, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'move', nodeId: 'a', parentNodeId: 'other' })) },
  'folder move': { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 45, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'move', nodeId: 'other', parentNodeId: 'folder' })) },
  'batch move': { budget: { write: 25, refresh: 6 }, overBudget: { wa: 'WA-057', write: 81, refresh: 6 }, run: workspace(() => Promise.resolve(), async () => {
    const versions = await currentVersions(['a', 'b']);
    return () => moveCompanionBatch(versions, 'other');
  }) },
  create: { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 41, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'create', nodeId: 'new', kind: 'topic', parentNodeId: 'folder', title: 'new' })) },
  'move to Trash': { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 50, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'delete', nodeId: 'b' })) },
  'batch move to Trash': { budget: { write: 25, refresh: 6 }, overBudget: { wa: 'WA-057', write: 77, refresh: 6 }, run: workspace(() => Promise.resolve(), async () => {
    const versions = await currentVersions(['b', 'c']);
    return () => moveCompanionBatchToTrash(versions);
  }) },
  restore: { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 51, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'restore', nodeId: 'gone' })) },
  'batch restore': { budget: { write: 25, refresh: 6 }, overBudget: { wa: 'WA-057', write: 51, refresh: 6 }, run: workspace(() => Promise.resolve(), async () => {
    const versions = await currentVersions(['gone']);
    return () => restoreCompanionBatchFromTrash(versions);
  }) },
  shelve: { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 51, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'shelve', nodeId: 'b' })) },
  unshelve: { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 50, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'unshelve', nodeId: 'shelved' })) },
  priority: { budget: { write: 15, refresh: 6 }, overBudget: { wa: 'WA-057', write: 48, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'set-priority', nodeId: 'b', priority: 3 })) },
  'undo move': { budget: { write: 25, refresh: 6 }, overBudget: { wa: 'WA-057', write: 52, refresh: 6 }, run: workspace(() => Promise.resolve(), replayMove('undo')) },
  'redo move': { budget: { write: 25, refresh: 6 }, overBudget: { wa: 'WA-057', write: 52, refresh: 6 }, run: workspace(() => Promise.resolve(), replayMove('redo')) },
  'Dive creation': { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 38, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive-new', title: 'new', sourceId: 'a' })) },
  'Virtual folder creation': { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 39, refresh: 6 }, run: workspace(() => mutateCompanionWorkspace({ type: 'create-index', nodeId: 'index-new', title: 'new' })) },
  'Dive source addition': { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 35, refresh: 6 }, run: workspace(() => addCompanionDiveSource('dive', 'c')) },
  'Dive source removal': { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 34, refresh: 6 }, run: workspace(() => removeCompanionDiveSources('dive', ['b'])) },
  'Virtual folder source addition': { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 35, refresh: 6 }, run: workspace(() => changeCompanionIndexSource('index', 'a', 'add')) },
  'Virtual folder source removal': { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 34, refresh: 6 }, run: workspace(() => changeCompanionIndexSource('index', 'c', 'remove')) },
  'Dive to Virtual folder conversion': { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 41, refresh: 6 }, run: workspace(() => convertCompanionDiveDirectory('dive', 'index', JSON.stringify(DIVE_NODE_FILTER))) },
  'Virtual folder to Dive conversion': { budget: { write: 20, refresh: 6 }, overBudget: { wa: 'WA-057', write: 38, refresh: 6 }, run: workspace(() => convertCompanionDiveDirectory('index', 'dive', JSON.stringify(createManualVirtualNodeFilter()))) },
  'reading progress': { budget: { write: 10, refresh: 3 }, run: workspace(() => saveCompanionSyncNodeReadingRecord({ nodeId: 'a', reading: {
    intervalDurationMs: 1, intervalGrowthFactor: 2, lastHandledAt: '2026-11-21T00:00:00.000Z', nextAt: '2026-11-22T00:00:00.000Z',
    priority: 5, readingPosition: 3, repetitionCount: 1, state: 'active' } })) },
  'scroll position': { budget: { write: 8, refresh: 2 }, run: workspace(() => saveCompanionSyncNodeViewState({ nodeId: 'a', scrollTop: 120 })) },
  'body save': { budget: { write: 30, refresh: 8 }, overBudget: { wa: 'WA-057', write: 78, refresh: 8 }, run: async () => {
    await openWorkspace();
    const source = await readCompanionContentSource('a', 'editor');
    phase = 'write';
    await saveCompanionContentEdit({ nodeId: 'a', baseVersionId: source.versionId, versionId: 'body-edit',
      content: 'Edited on the phone', updatedAt: '2026-11-21T00:00:01.000Z' });
    return { refresh: () => refreshCompanionWorkspaceAfterMutation(undefined, 'a') };
  } },
  grade: { budget: { write: 25, refresh: 3 }, overBudget: { wa: 'WA-057', write: 41, refresh: 3 }, run: async () => {
    const session = await openReviewFlow('review-first');
    const snapshot = await workspaceSnapshot();
    phase = 'write';
    await persistFlowMutation({ action: 'grade', grade: 3, nodeId: session.currentNodeId!, now: flowNow, snapshot,
      history: { key: 'flow_history:daily', mode: 'review-first', session } });
    return { refresh: () => refreshCompanionWorkspaceAfterMutation() };
  } },
  'topic Read': { budget: { write: 25, refresh: 3 }, overBudget: { wa: 'WA-057', write: 33, refresh: 3 }, run: async () => {
    const session = await openReviewFlow('reading-only');
    const snapshot = await workspaceSnapshot();
    phase = 'write';
    await persistFlowMutation({ action: 'read', nodeId: session.currentNodeId!, now: flowNow, snapshot,
      history: { key: 'flow_history:daily', mode: 'reading-only', session } });
    return { refresh: () => refreshCompanionWorkspaceAfterMutation() };
  } }
};

async function count(action: Action) {
  recorded.write = [];
  recorded.refresh = [];
  sqlRecording.start({ label: 'action-budget', maxGroups: 2000 });
  try {
    const { refresh } = await action.run();
    phase = 'refresh';
    await refresh();
  } finally {
    phase = null;
    sqlRecording.stop();
  }
  return { write: [...recorded.write], refresh: [...recorded.refresh] };
}

function describeStatements(statements: Statement[]) {
  return statements.map((value, index) => `#${index + 1} [${value.method}] ${value.sql.slice(0, 160)}\n    ${value.callers.join('\n    ')}`).join('\n');
}

const report: string[] = [];
const reportFile = process.env.FOLIOLE_SQL_BUDGET_REPORT;
const strict = process.env.FOLIOLE_SQL_BUDGET_STRICT === '1';
afterEach(() => { if (reportFile && report.length) writeFileSync(reportFile, `${report.join('\n\n')}\n`); });

for (const [name, action] of Object.entries(ACTIONS)) {
  it(`keeps a phone ${name} within its statement budget`, async () => {
    const counted = await count(action);
    if (reportFile) {
      report.push(`=== ${name}: write ${counted.write.length}, refresh ${counted.refresh.length}\n--- write\n${describeStatements(counted.write)}\n--- refresh\n${describeStatements(counted.refresh)}`);
    }
    const counts = { write: counted.write.length, refresh: counted.refresh.length };
    const ceiling = strict ? action.budget : action.overBudget ?? action.budget;
    const detail = `${name}: write ${counts.write} (ceiling ${ceiling.write}), refresh ${counts.refresh} (ceiling ${ceiling.refresh})\n`
      + `--- write\n${describeStatements(counted.write)}\n--- refresh\n${describeStatements(counted.refresh)}`;
    expect(counts.write <= ceiling.write && counts.refresh <= ceiling.refresh, detail).toBe(true);
    if (action.overBudget && !strict) {
      // Still over budget: when this fails the WA item has been fixed, so drop overBudget and keep the budget.
      expect(counts.write > action.budget.write || counts.refresh > action.budget.refresh,
        `${name} now fits its budget (${action.overBudget.wa}); remove overBudget`).toBe(true);
    }
  });
}
