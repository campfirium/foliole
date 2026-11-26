// @vitest-environment node
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { installSqlScaleProbe, prepareUnrecorded } from '../../electron/database/sqlScaleProbe.testSupport';
import { findLoopFullScans, type FullScanFinding } from '../../electron/database/sqlScanPlan.testSupport';
import { readCompanionContentSource } from '../shared/platform/companion/editing/companionContentEditing';
import { loadCompanionDailySession, openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { settleCompanionNodeVersionCollections } from '../shared/platform/companion/runtime/companionNodeHistory';

import { ACTIONS, closeActionLibrary, flowNow, library, openReviewFlow, openWorkspace, recording, setActionLibraryPadding, startWrite,
  workspaceSnapshot, type ActionRun } from './companionActionScenarios.testSupport';
import { startBridgeMeter, takeBridgeCalls, type BridgeCall } from './companionBridgeMeter.testSupport';
import { persistFlowMutation } from './companionFlowMutation';

// Everyday phone actions on a library and on one three times larger in content the actions never touch. Bridge round
// trips, returned rows and bridge bytes must not follow that growth, for the action, the refresh after it and the
// work it leaves behind; nor may a statement walk a whole table that grew. Time is not judged.
// The native sync plugin is a second bridge and is not counted here.

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/companionSyncNodeVersionsTestSupport', async importOriginal => {
  const original = await importOriginal<typeof import('../shared/platform/companionSyncNodeVersionsTestSupport')>();
  const { meterBridgeConnection } = await import('./companionBridgeMeter.testSupport');
  return { ...original, createFakeCapacitorConnection: (database: Database.Database) =>
    meterBridgeConnection(original.createFakeCapacitorConnection(database)) };
});

const PADDING = { small: 100, large: 300 };
// Grade reads one Flow candidate batch of up to 32 rows. Both libraries must fill it, or the batch itself looks like growth.
const FILLED_BATCH_PADDING: Record<string, typeof PADDING> = { grade: { small: 300, large: 900 } };
const METRICS = ['calls', 'rows', 'argBytes', 'resultBytes'] as const;
type Cost = Record<(typeof METRICS)[number], number>;

/** Findings that still follow library size, each with its row in the work amplification checks. Only shrinks. */
const KNOWN: Record<string, string> = {
  'grade | scans daily_flow_entries': 'WA-081',
  'move | scans nodes': 'WA-079',
  'move to Trash | scans sync_object_state': 'WA-080',
  'restore | scans sync_object_state': 'WA-080'
};

const grew = (metric: string, small: number, large: number) => large > small * 1.5 + (metric.endsWith('Bytes') ? 4096 : 20);

const noRefresh = async () => undefined;
const flowRead = async () => {
  const session = await openReviewFlow('reading-only');
  const snapshot = await workspaceSnapshot();
  return () => persistFlowMutation({ action: 'read', nodeId: session.currentNodeId!, now: flowNow, snapshot,
    history: { key: 'flow_history:daily', mode: 'reading-only', session } });
};

// One action per kind of work, so the check stays a few minutes. Further statement budget actions share these paths.
const SCENARIOS: Record<string, ActionRun> = {
  ...Object.fromEntries(['rename', 'move', 'create', 'move to Trash', 'restore', 'undo move', 'reading progress',
    'scroll position', 'body save', 'grade', 'topic Read'].map(name => [name, ACTIONS[name]!])),
  'body open': async () => {
    await openWorkspace();
    await startWrite();
    await readCompanionContentSource('a', 'editor');
    return { refresh: noRefresh };
  },
  'flow open (same day)': async () => {
    await openReviewFlow('reading-only');
    await startWrite();
    await openCompanionDailyFlow({ now: flowNow, mode: 'reading-only' });
    return { refresh: noRefresh };
  },
  'flow undo': async () => {
    await (await flowRead())();
    const session = (await loadCompanionDailySession())!;
    await startWrite();
    await replayCompanionFlowHistory('flow_history:daily', 'undo', session);
    return { refresh: noRefresh };
  }
};

const tableRows = (database: Database.Database, table: string) =>
  prepareUnrecorded(database, `SELECT COUNT(*) FROM "${table.replaceAll('"', '""')}"`).pluck().get() as number;

function countTables(database: Database.Database) {
  const tables = prepareUnrecorded(database, "SELECT name FROM sqlite_schema WHERE type = 'table' AND sql NOT LIKE 'CREATE VIRTUAL TABLE%'")
    .pluck().all() as string[];
  return Object.fromEntries(tables.map(table => [table, tableRows(database, table)]));
}

function inspectPlans() {
  const probe = installSqlScaleProbe('write');
  const planned = new Set<string>();
  const scans: (Pick<FullScanFinding, 'table' | 'plan' | 'sql' | 'via'> & { phase: string; sourceSql: string })[] = [];
  probe.onExecution = record => {
    const { sqlite, sql, step, lastArgs } = record;
    // The write-node read plans a walk of `nodes` for its Sequential Reading probe, which never runs when no
    // subtree is kept (third binding). That plan is judged only when the probe has rows to drive it.
    const idleProbe = sql.includes('probe(found) AS') && lastArgs[2] === '[]';
    const key = [sqlite.name, step, idleProbe, sql].join('\0');
    if (planned.has(key)) return;
    // Use the SQL and converted bindings the fake plugin actually executed, on the same connection.
    // The shared scanner treats failed plans as empty, so check the outer plan explicitly.
    try {
      prepareUnrecorded(sqlite, `EXPLAIN QUERY PLAN ${sql}`).all(...lastArgs);
    } catch (cause) {
      throw new Error(`Cannot explain executed SQL in ${step}: ${sql}`, { cause });
    }
    planned.add(key);
    for (const { table, plan, sql: scannedSql, via } of findLoopFullScans(record)) {
      if (idleProbe && table === 'nodes') continue;
      if (sqlite.name === library?.database.name) scans.push({ table, plan, sql: scannedSql, via, phase: step, sourceSql: sql });
    }
  };
  return { probe, planned, scans };
}

function total(calls: BridgeCall[]): Cost {
  const sum = (pick: (call: BridgeCall) => number) => calls.reduce((value, call) => value + pick(call), 0);
  return { calls: calls.length, rows: sum(call => call.rows), argBytes: sum(call => call.argBytes),
    resultBytes: sum(call => call.resultBytes) };
}

async function measure(name: string, run: ActionRun, padding: number) {
  setActionLibraryPadding(padding);
  const phases: Record<string, BridgeCall[]> = {};
  let inspection: ReturnType<typeof inspectPlans> | undefined;
  try {
    // The fixture's own pending work is settled before the meter starts, so it is not counted against the action.
    recording.onStart = async () => {
      await settleCompanionNodeVersionCollections();
      const fixtureNodes = prepareUnrecorded(library!.database, "SELECT COUNT(*) FROM nodes WHERE id GLOB 'filler-[0-9]*' AND id NOT LIKE '%-item'")
        .pluck().get();
      expect(fixtureNodes).toBe(padding);
      inspection = inspectPlans();
      startBridgeMeter();
    };
    const { refresh } = await run();
    phases.write = takeBridgeCalls();
    inspection!.probe.setStep('refresh');
    startBridgeMeter();
    await refresh();
    phases.refresh = takeBridgeCalls();
    inspection!.probe.setStep('deferred');
    startBridgeMeter();
    await settleCompanionNodeVersionCollections();
    phases.deferred = takeBridgeCalls();
    expect(phases.write.length).toBeGreaterThan(0);
    expect(inspection!.planned.size).toBeGreaterThan(0);
    if (refresh !== noRefresh) expect(phases.refresh.length).toBeGreaterThan(0);
    if (name === 'body save') expect(phases.deferred.length).toBeGreaterThan(0);
    const rawSql = Object.values(phases).flat().filter(call => call.method === 'execute').flatMap(call => call.sql);
    expect(rawSql.filter(sql => !/^\s*(?:BEGIN(?:\s+(?:DEFERRED|IMMEDIATE|EXCLUSIVE))?|COMMIT|ROLLBACK)\s*;?\s*$/iu.test(sql))).toEqual([]);
    const database = library!.database;
    const syncObjectTypes = process.env.FOLIOLE_ACTION_COST_REPORT_DIR
      ? prepareUnrecorded(database, 'SELECT object_type, COUNT(*) AS rows FROM sync_object_state GROUP BY object_type').all()
      : undefined;
    return { costs: Object.fromEntries(Object.entries(phases).map(([name, calls]) => [name, total(calls)])),
      phases, scans: inspection!.scans, planned: inspection!.planned.size, tableSizes: countTables(database), syncObjectTypes };
  } finally {
    inspection?.probe.uninstall();
    takeBridgeCalls();
    delete recording.onStart;
    recording.phase = null;
    await closeActionLibrary();
  }
}

it('keeps everyday phone actions independent of untouched library content', async () => {
  const findings = new Map<string, string>();
  const report: Record<string, unknown> = {};
  for (const [name, run] of Object.entries(SCENARIOS)) {
    const padding = FILLED_BATCH_PADDING[name] ?? PADDING;
    const small = await measure(name, run, padding.small);
    const large = await measure(name, run, padding.large);
    report[name] = { small, large };
    const over = Object.entries(small.costs).flatMap(([phase, before]) => METRICS
      .filter(metric => grew(metric, before[metric], large.costs[phase]![metric]))
      .map(metric => `${phase} ${metric} ${before[metric]} -> ${large.costs[phase]![metric]}`));
    if (over.length) findings.set(name, over.join(', '));
    for (const { table } of large.scans) {
      const before = small.tableSizes[table];
      const after = large.tableSizes[table];
      if (before !== undefined && after !== undefined && grew('rows', before, after)) {
        findings.set(`${name} | scans ${table}`, `${before} -> ${after} rows`);
      }
    }
  }
  const reportDir = process.env.FOLIOLE_ACTION_COST_REPORT_DIR;
  if (reportDir) writeFileSync(path.join(reportDir, 'phone-scale.json'), JSON.stringify(report));
  const unexpected = [...findings].filter(([key]) => !KNOWN[key]).map(([key, detail]) => `${key}: ${detail}`);
  const fixed = Object.keys(KNOWN).filter(key => !findings.has(key));
  // `fixed` means a known finding is gone: remove it from KNOWN and close its table row.
  expect({ unexpected, fixed }).toEqual({ unexpected: [], fixed: [] });
}, 600_000);
