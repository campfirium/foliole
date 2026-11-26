// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: mockedAppDataDir, app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'), app_log_dir: path.join(mockedAppDataDir, 'logs') })
}));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { resetSearchInvalidationCoalescerForTests } from '../database/searchIndexInvalidationCoalescer.js';
import { measureSqlStatements } from '../database/sqlStatementMeter.testSupport.js';

import { buildLibrary, drain, run } from './actionCostLibrary.testSupport.js';
import { runActions, type Measure } from './actionCostScenarios.testSupport.js';

// Everyday desktop actions on a library and on one three times larger in content the actions never touch.
// Statements, returned rows and bytes crossing the bridge must not follow that growth. Time is not judged.

const PADDING = { small: 200, large: 600 };
const METRICS = ['statements', 'rows', 'argBytes', 'resultBytes', 'deferredStatements', 'deferredRows'] as const;
type Cost = Record<(typeof METRICS)[number], number>;

/** Actions that still follow library size, each with its row in the work amplification checks. Only shrinks. */
const KNOWN: Record<string, string> = { 'flow open (after edits)': 'WA-068' };

const grew = (metric: string, small: number, large: number) => large > small * 1.5 + (metric.endsWith('Bytes') ? 4096 : 20);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? '');

async function measureLibrary(padding: number) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-action-cost-'));
  const costs = new Map<string, Cost>();
  const measure: Measure = async <T>(name: string, command: string, args: Record<string, unknown>) => {
    const argBytes = bytes(args);
    const measured = await measureSqlStatements(() => run<T>(command, args));
    const result = await measured.result;
    const deferred = (await measureSqlStatements(drain)).report;
    costs.set(name, { statements: measured.report.statements, rows: measured.report.rowsRead, argBytes,
      resultBytes: bytes(result), deferredStatements: deferred.statements, deferredRows: deferred.rowsRead });
    return result;
  };
  try {
    mockedAppDataDir = path.join(root, 'app-data');
    initializeDatabase();
    await buildLibrary(padding);
    await runActions(measure);
    return costs;
  } finally {
    resetSearchInvalidationCoalescerForTests();
    closeDatabaseConnection();
    await fs.rm(root, { recursive: true, force: true });
  }
}

it('keeps everyday desktop actions independent of untouched library content', async () => {
  const small = await measureLibrary(PADDING.small);
  const large = await measureLibrary(PADDING.large);
  expect([...large.keys()]).toEqual([...small.keys()]);
  const findings = new Map<string, string>();
  for (const [name, before] of small) {
    const after = large.get(name)!;
    const over = METRICS.filter(metric => grew(metric, before[metric], after[metric]));
    if (over.length) findings.set(name, over.map(metric => `${metric} ${before[metric]} -> ${after[metric]}`).join(', '));
  }
  const unexpected = [...findings].filter(([name]) => !KNOWN[name]).map(([name, detail]) => `${name}: ${detail}`);
  const fixed = Object.keys(KNOWN).filter(name => !findings.has(name));
  // `fixed` means a known row no longer grows: remove it from KNOWN and close its table row.
  expect({ unexpected, fixed }).toEqual({ unexpected: [], fixed: [] });
}, 300_000);
