// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUALITY_GATE_FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-fast.sh');

function runQualityGate(cwd, env = {}, args = []) {
  return new Promise((resolve) => {
    const child = spawn('bash', [QUALITY_GATE_FAST_SCRIPT, ...args], {
      cwd,
      env: { ...process.env, QUALITY_GATE_LOG_MODE: 'summary', ...env }
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
      resolve({ code, stderr, stdout });
    });
  });
}

async function writePackageJson(rootDir, scripts) {
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-lib-routing-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

async function writeFixtureFile(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

describe('quality-gate-fast lib routing', () => {
  it('delegates lib changes to the full gate', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-lib-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'full lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:full': 'node -e "console.log(\'full test ok\')"',
        build: 'node -e "console.log(\'build ok\')"',
        'electron:compile': 'node -e "console.log(\'electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'android web build ok\')"'
      });
      await writeFixtureFile(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'console.log("boundary ok");\n');

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'lib/core/database/desktopFreshSchemaStatements.ts'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: full');
      expect(result.stdout).toContain('[quality-gate:full] all checks passed.');
      expect(result.stdout).toContain('full test ok');
      expect(result.stdout).toContain('android web build ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('explains lib changes as a full gate route without running checks', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-lib-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'full lint should stay unused\')"',
        'test:full': 'node -e "console.log(\'full test should stay unused\')"'
      });

      const result = await runQualityGate(
        tempRoot,
        { QUALITY_GATE_CHANGED_FILES: 'lib/core/database/desktopFreshSchemaStatements.ts' },
        ['--route']
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-route] selected level: full');
      expect(result.stdout).toContain('shared runtime, desktop runtime, store, or dependency root changed');
      expect(result.stdout).toContain('[quality-gate-route] target: quality:full');
      expect(result.stdout).not.toContain('full lint should stay unused');
      expect(result.stdout).not.toContain('full test should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
