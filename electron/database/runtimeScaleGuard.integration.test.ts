// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let appRoot = '';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appRoot, 'cache'),
    app_config_dir: path.join(appRoot, 'config'),
    app_data_dir: path.join(appRoot, 'app-data'),
    app_log_dir: path.join(appRoot, 'logs'),
    documents_dir: path.join(appRoot, 'Documents')
  })
}));

import { collectTextBodyBlobCandidates } from '../../lib/core/database/textBodyBlobCollection.js';

import { closeDatabaseConnection } from './connection.js';
import { waitForManagedSafetySnapshotSettlements } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import { flushAllDirtyNodeSyncVersions, upsertNodeSnapshot } from './nodeMutations.js';
import {
  compareWithKnownScans,
  KNOWN_RUNTIME_GROWTH,
  KNOWN_RUNTIME_SCANS,
  withoutKnownGrowth,
  withoutKnownScanTime
} from './scaleGuardKnownFindings.testSupport.js';
import {
  defaultScaleGrowthLimits,
  fastestRun,
  findSuperlinearGrowth,
  formatScaleGrowthFindings,
  formatStepTimes
} from './sqlScaleRatio.testSupport.js';
import { runWithScaleProbe } from './sqlScanPlan.testSupport.js';
import { installUpgradeScaleLibrary, readUpgradeScaleManifest } from './upgradeScaleFixture.testSupport.js';

/** Same number of edits on every library size: their cost must not depend on how big the library is. */
const EDITED_CHAPTERS = 30;
const EDIT_STEPS = ['save_bodies', 'flush_versions'];
const tempRoots: string[] = [];
/** Two interleaved rounds per size; plan findings come from every run, timings from the fastest. */
const ROUNDS = 2;
const runs = new Map<string, Awaited<ReturnType<typeof exerciseLibrary>>[]>();

function editChapters(connection: ReturnType<typeof initializeDatabase>, round: number) {
  const chapters = connection.sqlite.prepare(`SELECT id, parent_id, title FROM nodes
    WHERE id LIKE 'book-%-chapter-%' ORDER BY id LIMIT ?`).all(EDITED_CHAPTERS) as
    { id: string; parent_id: string; title: string }[];
  chapters.forEach((chapter, index) => upsertNodeSnapshot({
    nodeId: chapter.id, parentNodeId: chapter.parent_id, kind: 'topic', title: chapter.title, isTitleManual: true,
    content: `# ${chapter.title}\n\nRevised for scale check ${round}.`, reveal: null, anchorLink: null,
    position: index, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: `2026-10-2${round}T00:00:00.000Z`
  }));
}

/** Upgrade outside the probe, then record the everyday write paths on the current schema. */
async function exerciseLibrary(scale: string) {
  appRoot = await mkdtemp(path.join(os.tmpdir(), `foliole-runtime-scale-${scale}-`));
  tempRoots.push(appRoot);
  installUpgradeScaleLibrary(scale, path.join(appRoot, 'Documents'));
  const connection = initializeDatabase(undefined, { deferSearchIndex: true });
  try {
    return await runWithScaleProbe('save_bodies', (probe) => {
      editChapters(connection, 1);
      probe.setStep('flush_versions');
      flushAllDirtyNodeSyncVersions();
      probe.setStep('collect_text_bodies');
      const hashes = (connection.sqlite.prepare("SELECT hash FROM content_blobs WHERE kind = 'text_body'")
        .all() as { hash: string }[]).map((row) => row.hash);
      connection.sqlite.transaction(() => collectTextBodyBlobCandidates(connection.driver, hashes))();
    });
  } finally {
    closeDatabaseConnection();
    await waitForManagedSafetySnapshotSettlements();
  }
}

beforeAll(async () => {
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const { name } of readUpgradeScaleManifest().scales) {
      runs.set(name, [...runs.get(name) ?? [], await exerciseLibrary(name)]);
    }
  }
}, 600_000);

afterAll(async () => {
  for (const root of tempRoots) await rm(root, { force: true, recursive: true });
});

describe('everyday writes at library scale', () => {
  it('never re-reads a whole table for each saved note or collected body', () => {
    const findings = [...runs.values()].flat().flatMap((run) => run.fullScanFindings);
    expect(compareWithKnownScans(findings, KNOWN_RUNTIME_SCANS)).toEqual({ unexpected: '', fixed: [] });
  });

  // The registered holder lookups are excluded here; the scan test above still lists them.
  it('keeps a fixed batch of edits as cheap on a large library as on a small one', () => {
    const [small, large] = readUpgradeScaleManifest().scales
      .map(({ name }) => fastestRun(runs.get(name)!.map((run) => withoutKnownScanTime(run.probe))));
    const limits = { ...defaultScaleGrowthLimits(4), maxRatio: 2 };
    const findings = findSuperlinearGrowth(small!, large!, limits)
      .filter((finding) => EDIT_STEPS.includes(finding.step));
    expect(formatScaleGrowthFindings(findings), formatStepTimes(large!)).toBe('');
  });

  it('keeps body collection proportional to the number of stored bodies', () => {
    const [small, large] = readUpgradeScaleManifest().scales
      .map(({ name }) => fastestRun(runs.get(name)!.map((run) => run.probe)));
    const findings = findSuperlinearGrowth(small!, large!, defaultScaleGrowthLimits(4))
      .filter((finding) => !EDIT_STEPS.includes(finding.step));
    expect(withoutKnownGrowth(formatScaleGrowthFindings(findings), KNOWN_RUNTIME_GROWTH), formatStepTimes(large!)).toBe('');
  });
});
