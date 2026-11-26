// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: mockedAppDataDir, app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'), documents_dir: path.join(mockedAppDataDir, 'documents'), app_log_dir: path.join(mockedAppDataDir, 'logs') })
}));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { resetSearchInvalidationCoalescerForTests } from '../database/searchIndexInvalidationCoalescer.js';
import { measureSqlStatements } from '../database/sqlStatementMeter.testSupport.js';

import { MEASURED_COMMANDS } from './actionCostCommandCoverage.testSupport.js';
import { buildLibrary, database, drain, run } from './actionCostLibrary.testSupport.js';
import { runActions, type Measure } from './actionCostScenarios.testSupport.js';
import { loadLibraryPathSettingsSync } from './libraryPaths.js';

// Everyday desktop actions on a library and on one three times larger in content the actions never touch.
// Statements, returned rows and bytes crossing the bridge must not follow that growth. Time is not judged.

const PADDING = { small: 200, large: 600 };
const METRICS = ['statements', 'rows', 'argBytes', 'resultBytes', 'deferredStatements', 'deferredRows'] as const;
type Cost = Record<(typeof METRICS)[number], number>;

/** Actions that still follow library size, each with its row in the work amplification checks. Only shrinks. */
const KNOWN: Record<string, string> = { 'move | deferredRows': 'WA-078', 'move to Trash | deferredRows': 'WA-078' };

const grew = (metric: string, small: number, large: number) => large > small * 1.5 + (metric.endsWith('Bytes') ? 4096 : 20);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) ?? '');

const measuredCommands = new Set<string>();

async function expectMirroredBody(libraryHome: string) {
  const relativePath = database().prepare("SELECT relative_path FROM mirror_articles WHERE article_id = 'work-2'").pluck().get();
  expect(typeof relativePath).toBe('string');
  const mirrorRoot = await fs.realpath(path.join(libraryHome, 'Mirror'));
  const output = await fs.realpath(path.resolve(mirrorRoot, String(relativePath)));
  expect(output.startsWith(mirrorRoot + path.sep)).toBe(true);
  await expect(fs.readFile(output, 'utf8')).resolves.toContain('Edited.');
}

async function measureLibrary(padding: number) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-action-cost-'));
  const libraryHome = path.join(root, 'Library');
  const details = new Map<string, unknown>();
  const costs = new Map<string, Cost>();
  const measure: Measure = async <T>(name: string, command: string, args: Record<string, unknown>) => {
    // Some scenarios prepare state with unmeasured commands before issuing their measured command.
    await drain();
    measuredCommands.add(command);
    const argBytes = bytes(args);
    const measured = await measureSqlStatements(() => run<T>(command, args));
    const result = await measured.result;
    const { report: deferred, result: indexed } = await measureSqlStatements(drain);
    if (name === 'body save') {
      expect(indexed).toBeGreaterThan(0);
      expect(deferred.statements).toBeGreaterThan(0);
      await expectMirroredBody(libraryHome);
    }
    costs.set(name, { statements: measured.report.statements, rows: measured.report.rowsRead, argBytes,
      resultBytes: bytes(result), deferredStatements: deferred.statements, deferredRows: deferred.rowsRead });
    if (process.env.FOLIOLE_ACTION_COST_REPORT_DIR) {
      details.set(name, { cost: costs.get(name), indexed, action: measured.report, deferred });
    }
    return result;
  };
  try {
    vi.stubEnv('FOLIOLE_LIBRARY_HOME', libraryHome);
    mockedAppDataDir = path.join(root, 'app-data');
    initializeDatabase();
    expect(loadLibraryPathSettingsSync().mirror).toBe(path.join(libraryHome, 'Mirror'));
    await buildLibrary(padding);
    await runActions(measure);
    const reportDir = process.env.FOLIOLE_ACTION_COST_REPORT_DIR;
    if (reportDir) await fs.writeFile(path.join(reportDir, `desktop-${padding}.json`), JSON.stringify(Object.fromEntries(details)));
    return costs;
  } finally {
    resetSearchInvalidationCoalescerForTests();
    closeDatabaseConnection();
    vi.unstubAllEnvs();
    await fs.rm(root, { recursive: true, force: true });
  }
}

it('keeps everyday desktop actions independent of untouched library content', async () => {
  const small = await measureLibrary(PADDING.small);
  const large = await measureLibrary(PADDING.large);
  expect([...large.keys()]).toEqual([...small.keys()]);
  // The command table must claim exactly the commands measured here.
  expect([...measuredCommands].sort()).toEqual(MEASURED_COMMANDS.map(name => NATIVE_COMMANDS[name]).sort());
  const findings = new Map<string, string>();
  for (const [name, before] of small) {
    const after = large.get(name)!;
    for (const metric of METRICS.filter(metric => grew(metric, before[metric], after[metric]))) {
      findings.set(`${name} | ${metric}`, `${before[metric]} -> ${after[metric]}`);
    }
  }
  const unexpected = [...findings].filter(([name]) => !KNOWN[name]).map(([name, detail]) => `${name}: ${detail}`);
  const fixed = Object.keys(KNOWN).filter(name => !findings.has(name));
  // `fixed` means a known row no longer grows: remove it from KNOWN and close its table row.
  expect({ unexpected, fixed }).toEqual({ unexpected: [], fixed: [] });
}, 300_000);
