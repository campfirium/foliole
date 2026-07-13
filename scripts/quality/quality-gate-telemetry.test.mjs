// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildQualityGateCostReport, readTelemetryEntries, resolveLatestRunDir } from './quality-gate-cost-report.mjs';
import { createQualityGateTempRoot, runQualityGate, writeExecutable, writeFixtureFile, writePackageJson } from './quality-gate-fast.test-support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-target.sh');

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
  }, 60000);

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
              'test:quality:preview': 'node -e "console.log(\'quality preview ok\')"',
              'build:vite-only': 'node -e "console.log(\'build ok\')"',
              'electron:compile': 'node -e "console.log(\'electron compile ok\')"',
              'android:web:build': 'node -e "console.log(\'android web build ok\')"'
            }
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const result = await runTargetGate(tempRoot, 'release-build');
      const { entries, runDir } = await readTelemetryRun(tempRoot);
      const report = buildQualityGateCostReport(runDir, entries, 3);

      expect(result.code).toBe(0);
      expect(entries.some((entry) => entry.scriptName === 'test:quality:preview')).toBe(true);
      expect(entries.some((entry) => entry.scriptName === 'build:vite-only')).toBe(true);
      expect(report).toContain('[quality-gate-cost] slowest steps: top 3');
      expect(report).toContain('[quality-gate-cost] benefit review candidates:');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);

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

  it('prefers the latest non-empty telemetry run over newer log-only runs', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-report-'));
    try {
      const logRoot = path.join(tempRoot, '.tmp', 'logs', 'quality-gate');
      const telemetryRun = path.join(logRoot, '20260610-110000-1');
      const logOnlyRun = path.join(logRoot, '20260610-120000-2');
      await mkdir(telemetryRun, { recursive: true });
      await mkdir(logOnlyRun, { recursive: true });
      await writeFile(path.join(telemetryRun, 'telemetry.jsonl'), '{"scriptName":"lint"}\n', 'utf8');
      await writeFile(path.join(logOnlyRun, 'lint.log'), 'lint ok\n', 'utf8');

      expect(resolveLatestRunDir(logRoot)).toBe(telemetryRun);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('records missing target-gate scripts as failed telemetry entries', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-telemetry-'));
    try {
      await writeFile(
        path.join(tempRoot, 'package.json'),
        `${JSON.stringify(
          {
            name: 'quality-gate-missing-script-fixture',
            private: true,
            scripts: {
              'test:quality:preview': 'node -e "console.log(\'quality preview ok\')"',
              'android:web:build': 'node -e "console.log(\'android web build ok\')"',
              'test:windows:native-preview': 'node -e "console.log(\'windows preview recovery ok\')"'
            }
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const result = await runTargetGate(tempRoot, 'release-build');
      const { entries } = await readTelemetryRun(tempRoot);

      expect(result.code).toBe(1);
      expect(entries.some((entry) => entry.scriptName === 'build:vite-only' && entry.exitCode === 1)).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
