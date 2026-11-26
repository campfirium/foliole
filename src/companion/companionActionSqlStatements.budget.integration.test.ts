// @vitest-environment node
import { writeFileSync } from 'node:fs';

import { afterEach, expect, it, vi } from 'vitest';

import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording';
import { moveCompanionBatch } from '../shared/platform/companion/runtime/companionWorkspaceBatchMove';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { moveCompanionBatchToTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';

import { ACTIONS, closeActionLibrary, currentVersions, openWorkspace, recording, type ActionRun, type Phase } from './companionActionScenarios.testSupport';

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
const recorded: Record<Phase, Statement[]> = { write: [], refresh: [] };
const originalBegin = sqlRecording.begin.bind(sqlRecording);
sqlRecording.begin = (sql: string, method: string, host: string) => {
  if (recording.phase) {
    const callers = (new Error().stack ?? '').split('\n').slice(1)
      .filter(line => /\/(src|lib)\//u.test(line))
      .filter(line => !/sqlRecording|capacitorSqliteDbPort|DbPort|companionEditHistorySession|\.budget\.integration|companionActionScenarios|node_modules/u.test(line))
      .map(line => line.trim().replace(/^at /u, '').replace(/\(?\/.*?\/(src|lib)\//u, '$1/').replace(/\)$/u, ''))
      .slice(0, 4);
    recorded[recording.phase].push({ sql: sql.replace(/\s+/gu, ' ').trim(), method, callers });
  }
  return originalBegin(sql, method, host);
};

afterEach(closeActionLibrary);

type Budget = {
  // Write and refresh budgets: statements, i.e. bridge round trips. Keep a small margin over the audited count.
  budget: { write: number; refresh: number };
  // The current count while a recorded WA item keeps the action over budget. The check then holds the count at
  // this ceiling and expects the budget to be broken, so a fix or a regression both show up here.
  overBudget?: { wa: string; write: number; refresh: number };
};

const BUDGETS: Record<string, Budget> = {
  rename: { budget: { write: 11, refresh: 6 } },
  move: { budget: { write: 12, refresh: 6 } },
  'folder move': { budget: { write: 12, refresh: 6 } },
  'batch move': { budget: { write: 12, refresh: 6 } },
  create: { budget: { write: 12, refresh: 6 } },
  'move to Trash': { budget: { write: 16, refresh: 6 } },
  'batch move to Trash': { budget: { write: 16, refresh: 6 } },
  restore: { budget: { write: 17, refresh: 6 } },
  'batch restore': { budget: { write: 17, refresh: 6 } },
  shelve: { budget: { write: 11, refresh: 6 } },
  unshelve: { budget: { write: 11, refresh: 6 } },
  priority: { budget: { write: 10, refresh: 6 } },
  'undo move': { budget: { write: 15, refresh: 6 } },
  'redo move': { budget: { write: 15, refresh: 6 } },
  'Dive creation': { budget: { write: 13, refresh: 6 } },
  'Virtual folder creation': { budget: { write: 13, refresh: 6 } },
  'Dive source addition': { budget: { write: 10, refresh: 6 } },
  'Dive source removal': { budget: { write: 9, refresh: 6 } },
  'Virtual folder source addition': { budget: { write: 10, refresh: 6 } },
  'Virtual folder source removal': { budget: { write: 9, refresh: 6 } },
  'Dive to Virtual folder conversion': { budget: { write: 17, refresh: 6 } },
  'Virtual folder to Dive conversion': { budget: { write: 16, refresh: 6 } },
  'reading progress': { budget: { write: 8, refresh: 3 } },
  'scroll position': { budget: { write: 6, refresh: 2 } },
  'body save': { budget: { write: 23, refresh: 8 } },
  grade: { budget: { write: 25, refresh: 3 }, overBudget: { wa: 'WA-057', write: 38, refresh: 3 } },
  'topic Read': { budget: { write: 25, refresh: 3 }, overBudget: { wa: 'WA-057', write: 30, refresh: 3 } }
};

async function count(run: ActionRun) {
  recorded.write = [];
  recorded.refresh = [];
  sqlRecording.start({ label: 'action-budget', maxGroups: 2000 });
  try {
    const { refresh } = await run();
    recording.phase = 'refresh';
    await refresh();
  } finally {
    recording.phase = null;
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

it('budgets exactly the shared phone actions', () => {
  expect(Object.keys(BUDGETS).sort()).toEqual(Object.keys(ACTIONS).sort());
});

for (const [name, run] of Object.entries(ACTIONS)) {
  const action = BUDGETS[name]!;
  it(`keeps a phone ${name} within its statement budget`, async () => {
    const counted = await count(run);
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

// A batch action reads and writes all its nodes together, so its statement count does not grow with the selection.
const BATCHES: Record<string, (ids: string[]) => Promise<unknown>> = {
  'batch move': async ids => { const versions = await currentVersions(ids); recording.phase = 'write'; await moveCompanionBatch(versions, 'other'); },
  'batch move to Trash': async ids => { const versions = await currentVersions(ids); recording.phase = 'write'; await moveCompanionBatchToTrash(versions); },
  'batch restore': async ids => {
    await moveCompanionBatchToTrash(await currentVersions(ids));
    const versions = await currentVersions(ids);
    recording.phase = 'write';
    await restoreCompanionBatchFromTrash(versions);
  }
};

async function batchWrites(run: (ids: string[]) => Promise<unknown>, size: number) {
  await closeActionLibrary();
  await openWorkspace();
  const ids = Array.from({ length: size }, (_, index) => `batch-${index}`);
  for (const id of ids) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId: 'folder', title: id });
  recorded.write = [];
  sqlRecording.start({ label: 'action-budget', maxGroups: 2000 });
  try { await run(ids); } finally { recording.phase = null; sqlRecording.stop(); }
  return recorded.write.length;
}

for (const [name, run] of Object.entries(BATCHES)) {
  it(`keeps a phone ${name} at the same statement count for two and six nodes`, async () => {
    const two = await batchWrites(run, 2);
    const six = await batchWrites(run, 6);
    expect({ name, six }).toEqual({ name, six: two });
  });
}
