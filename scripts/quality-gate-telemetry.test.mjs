// @vitest-environment node
/* global process */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildQualityGateCostReport, readTelemetryEntries } from './quality-gate-cost-report.mjs';
import { createQualityGateTempRoot, runQualityGate, writeExecutable, writeFixtureFile, writePackageJson } from './quality-gate-fast.test-support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-target.sh');

async function readTelemetryRun(rootDir) {
  const logRoot = path.join(rootDir, '.tmp', 'logs', 'quality-gate');
  const runDir = (await readdir(logRoot)).map((entry) => path.join(logRoot, entry)).sort().at(-1);
  const telemetryPath = path.join(runDir, 'telemetry.jsonl');
  const entries = (await readFile(telemetryPath, 'utf8')).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
  return { entries, runDir };
}

function runTargetGate(cwd, target) {
  return new Promise((resolve) => {
    const child = spawn('bash', [TARGET_SCRIPT, target], {
      cwd,
      env: { ...process.env, QUALITY_GATE_LOG_MODE: 'summary' }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe('quality gate telemetry', () => {
  it('records successful and failed fast-gate steps without changing exit status', async () => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'lint ok\')"',
        typecheck: 'node -e "console.log(\'typecheck failed\'); process.exit(1)"',
        test: 'node -e "console.log(\'test ok\')"'
      });
      await writeExecutable(tempRoot, 'node_modules/eslint/bin/eslint.js', '#!/usr/bin/env node\nconsole.log("lint ok")\n');
      await writeFixtureFile(tempRoot, 'src/local.ts', 'export const local = true;\n');

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_LOG_MODE: 'fail-only',
        QUALITY_GATE_CHANGED_FILES: 'src/local.ts'
      });
      const { entries } = await readTelemetryRun(tempRoot);

      expect(result.code).toBe(1);
      expect(entries.some((entry) => entry.scriptName === 'lint' && entry.exitCode === 0)).toBe(true);
      expect(entries.some((entry) => entry.scriptName === 'typecheck' && entry.exitCode === 1)).toBe(true);
      expect(entries.every((entry) => typeof entry.durationSeconds === 'number')).toBe(true);
      expect(entries.every((entry) => typeof entry.peakRssKb === 'number')).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 30000);

  it('records target-gate parallel child steps and reports the slowest costs', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-telemetry-'));
    try {
      await writeFile(
        path.join(tempRoot, 'package.json'),
        `${JSON.stringify(
          {
            name: 'quality-gate-telemetry-fixture',
            private: true,
            scripts: {
              'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
              'lint:full': 'node -e "console.log(\'lint full ok\')"',
              'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
              'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
              'test:desktop:src': 'node -e "console.log(\'desktop src ok\')"',
              'test:desktop:electron': 'node -e "console.log(\'desktop electron ok\')"',
              'test:windows:core': 'node -e "console.log(\'windows core ok\')"',
              'test:windows:preview-recovery': 'node -e "console.log(\'windows preview recovery ok\')"',
              'test:android': 'node -e "console.log(\'android test ok\')"',
              'test:shared': 'node -e "console.log(\'shared test ok\')"',
              'test:sync-pack': 'node -e "console.log(\'sync pack ok\')"',
              'test:quality:core': 'node -e "console.log(\'quality core ok\')"',
              'test:quality:gate': 'node -e "console.log(\'quality gate ok\')"',
              'test:quality:node': 'node -e "console.log(\'quality node ok\')"',
              'test:quality:preview': 'node -e "console.log(\'quality preview ok\')"',
              build: 'node -e "console.log(\'build ok\')"',
              'electron:compile': 'node -e "console.log(\'electron compile ok\')"',
              'android:web:build': 'node -e "console.log(\'android web build ok\')"'
            }
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const result = await runTargetGate(tempRoot, 'full');
      const { entries, runDir } = await readTelemetryRun(tempRoot);
      const report = buildQualityGateCostReport(runDir, entries, 3);

      expect(result.code).toBe(0);
      expect(entries.some((entry) => entry.scriptName === 'lint:full')).toBe(true);
      expect(entries.some((entry) => entry.scriptName === 'typecheck:android')).toBe(true);
      expect(entries.some((entry) => entry.scriptName === 'build')).toBe(true);
      expect(report).toContain('[quality-gate-cost] slowest steps: top 3');
      expect(report).toContain('[quality-gate-cost] benefit review candidates:');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 30000);

  it('formats an empty telemetry run as an actionable report', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-report-'));
    try {
      const { entries } = readTelemetryEntries(tempRoot);
      const report = buildQualityGateCostReport(tempRoot, entries, 5);

      expect(report).toContain('[quality-gate-cost] no telemetry entries found.');
      expect(report).toContain('pass --run-dir');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
