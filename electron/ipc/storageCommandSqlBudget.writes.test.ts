// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-storage-command-write-sql-budget-tests';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import { createFsrsReviewScheduler } from '../../lib/core/review/fsrsScheduler.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, createReviewSchedulerParameters, getReviewSchedulerVersion } from '../../lib/core/review/settings.js';
import { createInitialSchedulerCard, mapGradeToRustRating } from '../../lib/core/review/types.js';
import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { measureSqlStatements, type SqlStatementReport } from '../database/sqlStatementMeter.testSupport.js';

import { handleStorageCommand } from './storageCommands.js';

// Absolute statement budgets for everyday desktop writes (WA-063..065). Desktop SQL runs in process, so the
// absolute numbers matter less than growth: the batch and subtree checks below hold the per-node slope.
// `write` is the command itself, `deferred` the dirty-version drain it leaves for `flush_dirty_node_sync_versions`.
// Set FOLIOLE_SQL_BUDGET_REPORT=<file> to write every statement of every action.

const AT = '2026-10-19T00:00:00.000Z';
let tempRoot = '';
let tick = 0;
const nextTimestamp = () => new Date(Date.parse(AT) + ++tick * 1000).toISOString();

function seed(nodeId: string, parentNodeId: string | null, kind: 'folder' | 'topic' | 'item', position: number,
  extra: Partial<Parameters<typeof upsertNodeSnapshot>[0]> = {}) {
  upsertNodeSnapshot({
    anchorLink: null, content: kind === 'folder' ? '' : `# ${nodeId}\n\nBody of ${nodeId} with a Target sentence.`,
    createdAt: AT, isTitleManual: true, kind, nodeId, parentNodeId, position, reveal: null, title: nodeId, updatedAt: AT,
    ...extra
  });
}

const BODY = (id: string) => `# ${id}\n\nBody of ${id} with a Target sentence.`;
const anchor = (id: string) => ({ id, kind: 'highlight' as const, locator: {
  from: BODY('topic-0').indexOf('Target'), to: BODY('topic-0').length, originalText: 'Target sentence.' } });

/** folder-root holds `topics` topics and folder-nested (with `nested` topics); folder-other is empty. */
async function openLibrary({ topics = 6, nested = 3, anchors = 1 } = {}) {
  closeDatabaseConnection();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-storage-command-write-sql-budget-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  seed('folder-root', null, 'folder', 0);
  seed('folder-other', null, 'folder', 1);
  for (let index = 0; index < topics; index++) seed(`topic-${index}`, 'folder-root', 'topic', index);
  seed('folder-nested', 'folder-root', 'folder', topics);
  for (let index = 0; index < nested; index++) seed(`nested-${index}`, 'folder-nested', 'topic', index);
  for (let index = 0; index < anchors; index++) {
    seed(`anchor-${index}`, 'topic-0', 'item', index, { anchorLink: anchor(`anchor-${index}`), content: 'Target sentence.' });
  }
  await handleStorageCommand(NATIVE_COMMANDS.flushDirtyNodeSyncVersions, {});
}

const visible = (parentId: string) => readMoveParentOrder(openDatabaseConnection().driver, parentId).visibleIds;

function moveArgs(nodeIds: string[], from = 'folder-root', to = 'folder-other') {
  const fromIds = visible(from);
  const toIds = visible(to);
  return {
    nodes: nodeIds.map(nodeId => ({ nodeId, expectedParentNodeId: from, parentNodeId: to, updatedAt: nextTimestamp() })),
    parentOrders: [
      { parentNodeId: from, expectedChildIds: fromIds, childIds: fromIds.filter(id => !nodeIds.includes(id)) },
      { parentNodeId: to, expectedChildIds: toIds, childIds: [...toIds, ...nodeIds] }
    ],
    maintainSequentialReading: false, defaultPriority: 5
  };
}

function snapshotArgs(nodeId: string, patch: Record<string, unknown> = {}) {
  const row = openDatabaseConnection().sqlite.prepare('SELECT parent_id, position FROM nodes WHERE id = ?')
    .get(nodeId) as { parent_id: string | null; position: number };
  return { content: BODY(nodeId), createdAt: AT, isTitleManual: true, kind: 'topic', nodeId, parentNodeId: row.parent_id,
    position: row.position, reveal: null, title: nodeId, updatedAt: nextTimestamp(), ...patch };
}

const currentVersion = (nodeId: string) => String(openDatabaseConnection().sqlite
  .prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get(nodeId));

function gradeArgs(nodeId: string) {
  const reviewedAt = nextTimestamp();
  const cardBefore = createInitialSchedulerCard(reviewedAt);
  const cardAfter = createFsrsReviewScheduler({ loadSettings: () => DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    getSettingsVersion: getReviewSchedulerVersion, createParameters: createReviewSchedulerParameters })
    .grade({ card: cardBefore, rating: mapGradeToRustRating(3), now: reviewedAt }).card;
  return { nodeId, opId: `grade-${tick}`, grade: 3, reviewedAt, schedulerVersion: getReviewSchedulerVersion(DEFAULT_REVIEW_SCHEDULER_SETTINGS), cardBefore, cardAfter };
}

type Command = { command: string; args: () => Record<string, unknown> };
const cmd = (command: string, args: () => Record<string, unknown>): Command => ({ command, args });
type Counts = { write: number; deferred: number };

type Action = {
  library?: Parameters<typeof openLibrary>[0];
  prepare?: Command[];
  run: Command;
  // Statement budgets; keep a small margin over the audited count once the WA item is fixed.
  budget: Counts;
  // The current count while a recorded WA item keeps the action over budget; the check holds the count at this
  // ceiling and expects the budget to still be broken, so both a fix and a regression show up here.
  overBudget?: Counts & { wa: string };
};

const trash = (nodeIds: string[]) => cmd(NATIVE_COMMANDS.softDeleteNodes, () => ({ nodeIds, deletedAt: nextTimestamp() }));
const restore = (nodeIds: string[]) => cmd(NATIVE_COMMANDS.restoreNodes, () => ({ nodeIds }));
const bodyEdit = cmd(NATIVE_COMMANDS.updateNodeContentWithAnchors, () => ({
  parent: snapshotArgs('topic-0', { content: `Inserted first. ${BODY('topic-0')}` }), affectedAnchors: [],
  edit: { baseVersionId: currentVersion('topic-0'), versionId: `ver-edit-${tick}` }
}));

// Budgets are the target; `overBudget` holds the measured count (2026-11-22) while its WA item stays open.
const FIVE = ['topic-1', 'topic-2', 'topic-3', 'topic-4', 'topic-5'];
const SPLIT_FLUSH = 'WA-065'; // each dirty node versions and retires its old body one by one (about 20 statements a node)
export const ACTIONS: Record<string, Action> = {
  'single move': { run: cmd(NATIVE_COMMANDS.moveNodes, () => moveArgs(['topic-1'])), budget: { write: 35, deferred: 15 },
    overBudget: { wa: SPLIT_FLUSH, write: 35, deferred: 23 } },
  'folder move': { run: cmd(NATIVE_COMMANDS.moveNodes, () => moveArgs(['folder-nested'])), budget: { write: 39, deferred: 15 } },
  'batch move (5)': { run: cmd(NATIVE_COMMANDS.moveNodes, () => moveArgs(FIVE)),
    budget: { write: 47, deferred: 40 }, overBudget: { wa: SPLIT_FLUSH, write: 47, deferred: 103 } },
  'move to Trash': { run: trash(['topic-1']), budget: { write: 13, deferred: 15 }, overBudget: { wa: SPLIT_FLUSH, write: 13, deferred: 25 } },
  'batch move to Trash (5)': { run: trash(FIVE), budget: { write: 37, deferred: 40 },
    overBudget: { wa: SPLIT_FLUSH, write: 37, deferred: 105 } },
  restore: { prepare: [trash(['topic-1'])], run: restore(['topic-1']), budget: { write: 16, deferred: 15 },
    overBudget: { wa: SPLIT_FLUSH, write: 16, deferred: 25 } },
  'batch restore (5)': { prepare: [trash(FIVE)], run: restore(FIVE), budget: { write: 40, deferred: 40 },
    overBudget: { wa: SPLIT_FLUSH, write: 48, deferred: 105 } },
  // A metadata write retires the previous version's body like a body save does (WA-065 E).
  rename: { run: cmd(NATIVE_COMMANDS.updateNodeContent, () => snapshotArgs('topic-1', { title: 'Renamed' })), budget: { write: 24, deferred: 2 },
    overBudget: { wa: 'WA-065', write: 35, deferred: 2 } },
  'set priority': { run: cmd(NATIVE_COMMANDS.updateNodeContent, () => snapshotArgs('topic-1', { priority: 3 })), budget: { write: 20, deferred: 2 },
    overBudget: { wa: 'WA-065', write: 31, deferred: 2 } },
  // The shared edit path still reads the version graph and retires bodies a second time (lib/core/sync/localContentEdit.ts).
  'body save': { run: bodyEdit, budget: { write: 45, deferred: 2 }, overBudget: { wa: 'WA-064', write: 80, deferred: 2 } },
  'body save (4 anchors)': { library: { anchors: 4 }, run: bodyEdit, budget: { write: 60, deferred: 2 },
    overBudget: { wa: 'WA-064', write: 116, deferred: 2 } },
  grade: { library: { anchors: 0 }, run: cmd(NATIVE_COMMANDS.applyReviewGrade, () => gradeArgs('topic-1')), budget: { write: 10, deferred: 2 } }
};

export async function countAction(action: Action) {
  await openLibrary(action.library);
  for (const step of action.prepare ?? []) await handleStorageCommand(step.command, step.args());
  await handleStorageCommand(NATIVE_COMMANDS.flushDirtyNodeSyncVersions, {});
  const args = action.run.args();
  const write = (await measureSqlStatements(() => handleStorageCommand(action.run.command, args))).report;
  const deferred = (await measureSqlStatements(() => handleStorageCommand(NATIVE_COMMANDS.flushDirtyNodeSyncVersions, {}))).report;
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  tempRoot = '';
  return { write, deferred } satisfies Record<keyof Counts, SqlStatementReport>;
}

const describe = (report: SqlStatementReport) => report.records.some(entry => entry.callers)
  ? report.records.map((entry, index) => `#${index + 1} ${entry.sql.slice(0, 90)}  <- ${entry.callers!.join(' < ')}`).join('\n')
  : report.groups.map(group => `  ${group.count}x ${group.sql.slice(0, 180)}`).join('\n');
const report: string[] = [];
const strict = process.env.FOLIOLE_SQL_BUDGET_STRICT === '1';

beforeEach(() => { tick = 0; });
afterEach(async () => {
  closeDatabaseConnection();
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  tempRoot = '';
  if (process.env.FOLIOLE_SQL_BUDGET_REPORT && report.length) await fs.writeFile(process.env.FOLIOLE_SQL_BUDGET_REPORT, `${report.join('\n\n')}\n`);
});

for (const [name, action] of Object.entries(ACTIONS)) {
  it(`keeps a desktop ${name} within its statement budget`, async () => {
    const reports = await countAction(action);
    const counts = { write: reports.write.statements, deferred: reports.deferred.statements };
    const detail = `${name}: write ${counts.write}, deferred ${counts.deferred}\n--- write\n${describe(reports.write)}\n--- deferred\n${describe(reports.deferred)}`;
    report.push(`=== ${detail}`);
    const ceiling = strict ? action.budget : action.overBudget ?? action.budget;
    expect(counts.write <= ceiling.write && counts.deferred <= ceiling.deferred, detail).toBe(true);
    if (action.overBudget && !strict) {
      // Still over budget: when this fails the WA item has been fixed, so drop overBudget and keep the budget.
      expect(counts.write > action.budget.write || counts.deferred > action.budget.deferred,
        `${name} now fits its budget (${action.overBudget.wa}); remove overBudget`).toBe(true);
    }
  });
}

// One move, Trash or restore command carries all its nodes: each extra node may add only its own row writes.
// The deferred version flush still writes node by node (WA-065), so its slope has a recorded ceiling.
type Slope = { write: number; deferred: number };
const PER_NODE: Record<string, { slope: Slope; overBudget?: Slope & { wa: string }; run: (ids: string[]) => Command;
  prepare?: (ids: string[]) => Command }> = {
  'batch move': { slope: { write: 3, deferred: 3 }, overBudget: { wa: SPLIT_FLUSH, write: 3, deferred: 20 },
    run: ids => cmd(NATIVE_COMMANDS.moveNodes, () => moveArgs(ids)) },
  'batch move to Trash': { slope: { write: 6, deferred: 3 }, overBudget: { wa: SPLIT_FLUSH, write: 6, deferred: 20 }, run: trash },
  // Restore also clears each node's import disposition and returns each restored node's own child order.
  'batch restore': { slope: { write: 6, deferred: 3 }, overBudget: { wa: SPLIT_FLUSH, write: 8, deferred: 20 }, run: restore, prepare: trash }
};

function assertSlope(name: string, slope: Slope, budget: Slope, overBudget: (Slope & { wa: string }) | undefined, detail: string) {
  const ceiling = strict ? budget : overBudget ?? budget;
  expect(slope.write <= ceiling.write && slope.deferred <= ceiling.deferred, `${name}: ${detail}`).toBe(true);
  if (overBudget && !strict) {
    expect(slope.write > budget.write || slope.deferred > budget.deferred,
      `${name} now fits its slope (${overBudget.wa}); remove overBudget`).toBe(true);
  }
}

for (const [name, entry] of Object.entries(PER_NODE)) {
  it(`keeps the per-node statement growth of a desktop ${name} small`, async () => {
    const at = (ids: string[]) => countAction({ prepare: entry.prepare ? [entry.prepare(ids)] : [], run: entry.run(ids), budget: { write: 0, deferred: 0 } });
    const one = await at(['topic-1']);
    const five = await at(FIVE);
    const slope = { write: (five.write.statements - one.write.statements) / 4, deferred: (five.deferred.statements - one.deferred.statements) / 4 };
    assertSlope(name, slope, entry.slope, entry.overBudget,
      `write ${one.write.statements} -> ${five.write.statements}, deferred ${one.deferred.statements} -> ${five.deferred.statements}`);
  });
}

it('keeps the per-anchor statement growth of a desktop body save small', async () => {
  const at = async (anchors: number) => (await countAction({ library: { anchors }, run: bodyEdit, budget: { write: 0, deferred: 0 } })).write.statements;
  const one = await at(1);
  const four = await at(4);
  // Each shifted highlight writes its own version (flush and body retirement per child, WA-064).
  assertSlope('body save anchors', { write: (four - one) / 3, deferred: 0 }, { write: 4, deferred: 0 },
    { wa: 'WA-064', write: 12, deferred: 0 }, `1 anchor ${one}, 4 anchors ${four}`);
});

it('keeps a desktop folder move independent of the moved subtree size', async () => {
  const at = async (nested: number) => {
    const counted = await countAction({ library: { nested }, run: cmd(NATIVE_COMMANDS.moveNodes, () => moveArgs(['folder-nested'])),
      budget: { write: 0, deferred: 0 } });
    return counted.write.statements;
  };
  const small = await at(2);
  const large = await at(10);
  expect(large, `folder move: 2 descendants ${small}, 10 descendants ${large}`).toBe(small);
});
