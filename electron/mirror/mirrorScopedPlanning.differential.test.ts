// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'),
  app_config_dir: path.join(appData, 'config'), app_log_dir: path.join(appData, 'logs'),
  documents_dir: path.join(appData, 'Documents')
}) }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn(async () => {}) }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false, themeSource: 'system' },
  systemPreferences: { getUserDefault: vi.fn(), subscribeNotification: vi.fn() } }));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { type ArticleMirrorPlan, collectArticleMirrorPlans } from './articleMirrorPlanning.js';
import { loadMirrorArticleRecords, type MirrorArticleRecord, resolveAbsoluteMirrorPath, saveMirrorArticleRecord } from './mirrorOutputStorage.js';
import { collectProtectedMirrorPaths, mirrorPathKey } from './mirrorPathIdentity.js';
import { collectChangedMirrorOwners } from './mirrorPathOwnership.js';
import { captureScopedMirrorPlans } from './mirrorScopedCapture.js';
import { createRandom, createRandomLibrary } from './mirrorScopedDifferential.testSupport.js';
import { resetMirrorTestWorkspace } from './mirrorTestDatabase.js';

const MIRROR_ROOT = path.join(os.tmpdir(), 'foliole-scoped-planning', 'Mirror');

beforeEach(async () => {
  appData = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-scoped-planning-'));
  initializeDatabase();
  resetMirrorTestWorkspace();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(appData, { recursive: true, force: true });
});

type Random = ReturnType<typeof createRandom>;

/** Records as earlier passes, renames, case changes and stale layouts could have left them. */
function seedRecords(random: Random, plans: ArticleMirrorPlan[], nodeIds: string[]) {
  const paths = plans.map((plan) => plan.relativePath);
  const variant = (value: string) => random.pick([value.toUpperCase(), value.normalize('NFD'), value.toLowerCase()]);
  for (const plan of plans) {
    const directory = path.posix.dirname(plan.relativePath);
    const relativePath = random.pick([plan.relativePath, plan.relativePath, plan.relativePath, variant(plan.relativePath),
      random.pick(paths), path.posix.join(directory, 'Renamed.md'), path.posix.join(random.pick(paths), 'Nested.md'),
      path.posix.join(plan.relativePath.replace(/\.md$/, ''), 'Legacy.md'), null]);
    if (relativePath) saveMirrorArticleRecord({ articleId: plan.articleId, mirroredAt: '2026-10-06T00:00:00.000Z', relativePath });
  }
  const planned = new Set(plans.map((plan) => plan.articleId));
  for (const nodeId of nodeIds.filter((id) => !planned.has(id) && random.chance(0.3))) {
    const relativePath = variant(random.pick([...paths, 'Note.md']));
    saveMirrorArticleRecord({ articleId: nodeId, mirroredAt: '2026-10-06T00:00:00.000Z', relativePath });
  }
}

function protection(plans: ArticleMirrorPlan[], records: Map<string, MirrorArticleRecord>, articleId: string) {
  const files = [...plans.filter((plan) => plan.articleId !== articleId).map((plan) => plan.targetPath),
    ...[...records.values()].filter((record) => record.articleId !== articleId)
      .map((record) => resolveAbsoluteMirrorPath(MIRROR_ROOT, record.relativePath))];
  return { files: new Set(files.map((file) => mirrorPathKey(path.resolve(file)))), paths: collectProtectedMirrorPaths(files) };
}

function retiredPaths(plan: ArticleMirrorPlan, record: MirrorArticleRecord | undefined) {
  const files = [plan.relativePath, ...record ? [record.relativePath] : []]
    .map((relativePath) => resolveAbsoluteMirrorPath(MIRROR_ROOT, relativePath));
  return [...files, ...files.map((file) => path.join(path.dirname(file), path.basename(file, '.md')))]
    .map((file) => mirrorPathKey(path.resolve(file)));
}

function expectScopedMatchesFull(selected: string[], plans: ArticleMirrorPlan[], records: Map<string, MirrorArticleRecord>) {
  const scoped = captureScopedMirrorPlans(selected, MIRROR_ROOT);
  if (!scoped) return false;
  const fullById = new Map(plans.map((plan) => [plan.articleId, plan]));
  for (const plan of scoped.plans) {
    const full = fullById.get(plan.articleId);
    // Serialized, since plan revisions compare JSON and key order matters there.
    if (selected.includes(plan.articleId)) expect(JSON.stringify(plan)).toBe(JSON.stringify(full));
    else expect([plan.relativePath, plan.targetPath]).toEqual([full?.relativePath, full?.targetPath]);
  }
  expect(collectChangedMirrorOwners(plans, records, new Set(selected)).size).toBe(0);
  for (const articleId of selected) {
    const plan = fullById.get(articleId)!;
    const directory = path.posix.dirname(plan.relativePath);
    const siblings = plans.filter((other) => path.posix.dirname(other.relativePath) === directory).map((other) => other.articleId);
    expect(scoped.plans.map((other) => other.articleId)).toEqual(expect.arrayContaining(siblings));
    expect(scoped.recordsByArticleId.get(articleId)).toEqual(records.get(articleId));
    const full = protection(plans, records, articleId);
    const local = protection(scoped.plans, scoped.recordsByArticleId, articleId);
    for (const key of retiredPaths(plan, records.get(articleId))) {
      expect([key, local.paths.has(key), local.files.has(key)]).toEqual([key, full.paths.has(key), full.files.has(key)]);
    }
  }
  return true;
}

function countMatchingSelections(random: Random, nodeIds: string[], plans: ArticleMirrorPlan[]) {
  const records = loadMirrorArticleRecords();
  let scoped = 0;
  for (const nodeId of nodeIds) {
    if (expectScopedMatchesFull([nodeId], plans, records)) scoped += 1;
  }
  for (let pair = 0; pair < 20; pair += 1) {
    if (expectScopedMatchesFull([random.pick(nodeIds), random.pick(nodeIds)], plans, records)) scoped += 1;
  }
  return scoped;
}

function checkRandomLibrary(seed: number) {
  resetMirrorTestWorkspace();
  const random = createRandom(seed);
  const library = createRandomLibrary(random);
  library.seed(40);
  for (let step = 0; step < 30; step += 1) library.step();
  const snapshot = loadWorkspaceSnapshot({ includeBody: false, includeReveal: false })!;
  const plans = collectArticleMirrorPlans(snapshot, MIRROR_ROOT);
  const nodeIds = [...library.nodes.keys()];
  // Without records, and with records already at every planned path, as after earlier passes.
  let clean = countMatchingSelections(random, nodeIds, plans);
  for (const plan of plans) {
    saveMirrorArticleRecord({ articleId: plan.articleId, mirroredAt: '2026-10-06T00:00:00.000Z', relativePath: plan.relativePath });
  }
  clean += countMatchingSelections(random, nodeIds, plans);
  // Stale, clashing and nested records must either fall back or still match the full planner.
  seedRecords(random, plans, nodeIds);
  return { clean, stale: countMatchingSelections(random, nodeIds, plans) };
}

it('plans selected articles from their directories exactly as the full planner in random libraries', () => {
  let clean = 0;
  let stale = 0;
  for (let seed = 1; seed <= 16; seed += 1) {
    const counts = checkRandomLibrary(seed);
    clean += counts.clean;
    stale += counts.stale;
  }
  // The comparison must exercise the scoped planner, not only its fallbacks.
  expect(clean).toBeGreaterThan(100);
  expect(stale).toBeGreaterThan(10);
});
