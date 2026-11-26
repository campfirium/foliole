// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'),
  app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs'),
  documents_dir: path.join(appData, 'Documents')
}) }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn(async () => {}) }));
vi.mock('./mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() } }));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { updateLibraryPathSetting } from '../ipc/libraryPaths.js';

import { loadMirrorArticleRecords } from './mirrorOutputStorage.js';
import { rebuildAllMirrorOutput, syncIncrementalMirrorOutput } from './mirrorOutputSync.js';
import * as scopedCapture from './mirrorScopedCapture.js';
import { createRandom, createRandomLibrary } from './mirrorScopedDifferential.testSupport.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function readTree(directory: string, prefix = ''): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const lines: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) lines.push(`${relative}/`, ...await readTree(path.join(directory, entry.name), `${relative}/`));
    else lines.push(`${relative}: ${await fs.readFile(path.join(directory, entry.name), 'utf8')}`);
  }
  return lines;
}

function readRecords() {
  return [...loadMirrorArticleRecords().values()].map((record) => `${record.articleId} -> ${record.relativePath}`).sort();
}

/** Runs one random edit sequence with incremental syncs, recording the mirror after every step. */
async function runSequence(seed: number, scoped: boolean) {
  closeDatabaseConnection();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-scoped-sync-'));
  roots.push(root);
  appData = path.join(root, 'app-data');
  initializeDatabase();
  resetMirrorTestWorkspace();
  await updateLibraryPathSetting({ location: 'library_home', path: path.join(root, 'Library') });
  const capture = vi.spyOn(scopedCapture, 'captureScopedMirrorPlans');
  if (!scoped) capture.mockReturnValue(null);
  const random = createRandom(seed);
  const library = createRandomLibrary(random);
  library.seed(20);
  await rebuildAllMirrorOutput();
  const states: string[][] = [];
  for (let step = 0; step < 30; step += 1) {
    const touched = library.step();
    if (touched.length > 0) await syncIncrementalMirrorOutput(touched);
    states.push([`step ${step}: ${touched.join(',')}`, ...await readTree(path.join(root, 'Library', 'Mirror')), ...readRecords()]);
  }
  const scopedPasses = capture.mock.results.filter((result) => result.type === 'return' && result.value).length;
  capture.mockRestore();
  return { scopedPasses, states };
}

it('writes, renames and retires mirror files the same with and without scoped planning', async () => {
  let scopedPasses = 0;
  for (let seed = 1; seed <= 8; seed += 1) {
    const full = await runSequence(seed, false);
    const scoped = await runSequence(seed, true);
    expect(scoped.states).toEqual(full.states);
    scopedPasses += scoped.scopedPasses;
  }
  // The sequences must exercise the scoped planner, not only its fallbacks.
  expect(scopedPasses).toBeGreaterThan(40);
}, 120_000);
