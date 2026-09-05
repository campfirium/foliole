// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { runManagedCommand } from './quality-gate-fast.test-support.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUALITY_GATE_FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-fast.sh');
const QUALITY_GATE_ROUTING_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-fast-routing.sh');
const QUALITY_GATE_INTEGRATION_TIMEOUT_MS = 300_000;
const QUALITY_SCRIPT_STEPS = [
  'test:quality:core',
  'test:quality:gate',
  'test:quality:gate-integration:target-telemetry',
  'test:quality:gate-integration:target-collect',
  'test:quality:gate-integration:target-failures',
  'test:quality:gate-integration:routing',
  'test:quality:gate-integration:release-targets',
  'test:quality:gate-integration:fast-delegation',
  'test:quality:gate-integration:release-tail',
  'test:quality:gate-integration:target-core',
  'test:quality:node',
  'test:quality:preview'
];

function runQualityGate(cwd, env = {}, args = []) {
  return runManagedCommand('bash', [QUALITY_GATE_FAST_SCRIPT, ...args], {
    cwd,
    env,
    label: 'quality-gate-fast-lib-routing',
    timeoutMs: QUALITY_GATE_INTEGRATION_TIMEOUT_MS
  });
}

function runRoutingHelper(expression, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', `source "${QUALITY_GATE_ROUTING_SCRIPT}"; ${expression}`], {
      cwd: REPO_ROOT,
      env
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
  const fixtureScripts = {
    'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
    'deps:scan': 'node -e "console.log(\'dependency declarations ok\')"',
    ...scripts
  };
  for (const step of QUALITY_SCRIPT_STEPS) {
    fixtureScripts[step] ??= scripts['test:quality'];
  }
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-lib-routing-fixture', private: true, scripts: fixtureScripts }, null, 2)}\n`,
    'utf8'
  );
}

async function writeFixtureFile(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

async function createQualityGateTempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-lib-'));
  await writeFixtureFile(root, 'scripts/quality/quality-critical-test-routes.mjs', 'process.exit(0);\n');
  return root;
}

describe('quality-gate-fast lib routing', () => {
  it('matches skip lint only for test or skip-governance changes', async () => {
    await expect(
      runRoutingHelper("quality_skip_lint_changed_files_match $'src/app/example.test.ts\\nsrc/app/example.ts'")
    ).resolves.toMatchObject({ code: 0 });
    await expect(
      runRoutingHelper("quality_skip_lint_changed_files_match 'scripts/quality/quality-skip-lint.mjs'")
    ).resolves.toMatchObject({ code: 0 });
    await expect(
      runRoutingHelper("quality_skip_lint_changed_files_match 'src/app/example.ts'")
    ).resolves.toMatchObject({ code: 1 });
  }, 60000);

  it('continues dynamic routing after a valid empty static route', async () => {
    await expect(runRoutingHelper("resolve_quality_gate_route 'src/features/cards/Card.tsx'")).resolves.toMatchObject({
      code: 0,
      stdout: 'light\tlocal source change'
    });
  });

  it('fails closed when the path domain module cannot load', async () => {
    const result = await runRoutingHelper(
      "resolve_quality_gate_route 'src/store/workspaceStore.ts'",
      { ...process.env, QUALITY_PATH_DOMAINS_SCRIPT: '/missing/path-domains.mjs' }
    );

    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toContain('light');
    expect(result.stderr).toContain('path domain resolution failed');
  });

  it('caps lib changes locally and defers hosted quality to scheduled T7', async () => {
    const tempRoot = await createQualityGateTempRoot();
    try {
      await writePackageJson(tempRoot, {
        'lint:shared:full': 'node -e "console.log(\'shared lint ok\')"',
        'typecheck:shared': 'node -e "console.log(\'shared typecheck ok\')"',
        'test:shared': 'node -e "console.log(\'shared test ok\')"',
        'test:quality': 'node -e "console.log(\'quality test ok\')"',
        build: 'node -e "console.log(\'build ok\')"',
        'electron:compile': 'node -e "console.log(\'electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'android web build ok\')"'
      });
      await writeFixtureFile(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'console.log("boundary ok");\n');

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'lib/core/database/desktopFreshSchemaStatements.ts'
      });

      expect(result.code, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: shared');
      expect(result.stdout).toContain('hosted quality deferred to scheduled T7 Hosted Quality');
      expect(result.stdout).toContain('Remote Quality is reserved for repair or explicit rechecks on dev');
      expect(result.stdout).not.toContain('remote quality required');
      expect(result.stdout).toContain('[quality-gate-fast] capped local checks passed.');
      expect(result.stdout).toContain('boundary ok');
      expect(result.stdout).toContain('shared typecheck ok');
      expect(result.stdout).not.toContain('android boundary ok');
      expect(result.stdout).not.toContain('shared test ok');
      expect(result.stdout).not.toContain('android web build ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, QUALITY_GATE_INTEGRATION_TIMEOUT_MS);

  it('explains lib changes as a shared gate route without running checks', async () => {
    const tempRoot = await createQualityGateTempRoot();
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
      expect(result.stdout).toContain('[quality-gate-route] selected level: shared');
      expect(result.stdout).toContain('shared runtime or store changed');
      expect(result.stdout).toContain('[quality-gate-route] target: quality:shared');
      expect(result.stdout).not.toContain('full lint should stay unused');
      expect(result.stdout).not.toContain('full test should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }, 60000);
});
