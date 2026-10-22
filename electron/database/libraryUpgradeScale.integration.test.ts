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

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/index.js';

import { closeDatabaseConnection } from './connection.js';
import { waitForManagedSafetySnapshotSettlements } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import { compareWithKnownScans, KNOWN_UPGRADE_SCANS } from './scaleGuardKnownFindings.testSupport.js';
import { NUMBERED_MIGRATION_STEP } from './sqlScaleProbe.testSupport.js';
import {
  defaultScaleGrowthLimits,
  fastestRun,
  findSuperlinearGrowth,
  formatScaleGrowthFindings,
  formatStepTimes
} from './sqlScaleRatio.testSupport.js';
import { runWithScaleProbe } from './sqlScanPlan.testSupport.js';
import { installUpgradeScaleLibrary, readUpgradeScaleManifest } from './upgradeScaleFixture.testSupport.js';

const tempRoots: string[] = [];
/** Two interleaved rounds per size; plan findings come from every run, timings from the fastest. */
const ROUNDS = 2;
const runs = new Map<string, Awaited<ReturnType<typeof upgradeLibrary>>[]>();

/** Open an old-release library with the production startup path, recording every statement on the way. */
async function upgradeLibrary(scale: string) {
  appRoot = await mkdtemp(path.join(os.tmpdir(), `foliole-upgrade-scale-${scale}-`));
  tempRoots.push(appRoot);
  installUpgradeScaleLibrary(scale, path.join(appRoot, 'Documents'));
  let nodes = 0;
  let version = 0;
  const run = await runWithScaleProbe(NUMBERED_MIGRATION_STEP, async (probe) => {
    try {
      const connection = initializeDatabase(undefined, { deferSearchIndex: true });
      probe.setStep('verify');
      version = connection.sqlite.pragma('user_version', { simple: true }) as number;
      nodes = (connection.sqlite.prepare('SELECT COUNT(*) AS count FROM nodes').get() as { count: number }).count;
    } finally {
      closeDatabaseConnection();
      await waitForManagedSafetySnapshotSettlements();
    }
  });
  return { ...run, nodes, version };
}

beforeAll(async () => {
  for (let round = 0; round < ROUNDS; round += 1) {
    for (const { name } of readUpgradeScaleManifest().scales) {
      runs.set(name, [...runs.get(name) ?? [], await upgradeLibrary(name)]);
    }
  }
}, 600_000);

afterAll(async () => {
  for (const root of tempRoots) await rm(root, { force: true, recursive: true });
});

describe(`${readUpgradeScaleManifest().release} library upgrade at scale`, () => {
  it('upgrades both library sizes to the current schema with every note kept', () => {
    const { scales } = readUpgradeScaleManifest();
    for (const { name, chapters } of scales) {
      for (const run of runs.get(name)!) {
        expect(run.version).toBe(DATABASE_SCHEMA_VERSION);
        expect(run.nodes).toBeGreaterThanOrEqual(chapters * 2);
      }
    }
  });

  it('never re-reads a whole table for each item of a migration or startup step', () => {
    const findings = [...runs.values()].flat().flatMap((run) => run.fullScanFindings);
    expect(compareWithKnownScans(findings, KNOWN_UPGRADE_SCANS)).toEqual({ unexpected: '', fixed: [] });
  });

  it('keeps every migration and startup step proportional to library size', () => {
    const [small, large] = readUpgradeScaleManifest().scales
      .map(({ name }) => fastestRun(runs.get(name)!.map((run) => run.probe)));
    const findings = findSuperlinearGrowth(small!, large!, defaultScaleGrowthLimits(4));
    expect(formatScaleGrowthFindings(findings), formatStepTimes(large!)).toBe('');
  });
});
