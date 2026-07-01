// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-target.sh');
const ok = (message) => `printf '%s\\n' '${message}'`;
const fail = (message) => `printf '%s\\n' '${message}'; exit 1`;
const qualityScriptEntries = {
  'test:quality:core': ok('quality core test still ran'),
  'test:quality:gate': ok('quality gate test still ran'),
  'test:quality:gate-integration:target-telemetry': ok('quality telemetry test still ran'),
  'test:quality:gate-integration:target-collect': ok('quality collect test still ran'),
  'test:quality:gate-integration:target-failures': ok('quality failures test still ran'),
  'test:quality:gate-integration:routing': ok('quality routing test still ran'),
  'test:quality:gate-integration:release-targets': ok('quality release target test still ran'),
  'test:quality:gate-integration:fast-delegation': ok('quality fast delegation test still ran'),
  'test:quality:gate-integration:release-tail': ok('quality release tail test still ran'),
  'test:quality:gate-integration:target-core': ok('quality target core test still ran'),
  'test:quality:node': ok('quality node test still ran'),
  'test:quality:preview': ok('quality preview test still ran')
};

function runTargetGate(cwd, target, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [TARGET_SCRIPT, target], {
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
      resolve({ code, stdout, stderr });
    });
  });
}

async function writePackageJson(rootDir, scripts) {
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name: 'quality-gate-collect-fixture', private: true, scripts }, null, 2)}\n`,
    'utf8'
  );
}

async function writeRepositoryRootBoundaryScript(rootDir, message = 'repository boundary ok') {
  const scriptsDir = path.join(rootDir, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'check-repository-root-boundary.mjs'), `console.log('${message}')\n`, 'utf8');
}

describe('quality-gate-target.sh collected failure mode', () => {
  it('continues sequential desktop steps and reports all failures at the end', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-collect-'));
    try {
      await writePackageJson(tempRoot, {
        'lint:desktop:full': fail('lint failed details'),
        'typecheck:desktop': fail('typecheck failed details'),
        'test:desktop': ok('desktop test still ran'),
        ...qualityScriptEntries,
        build: ok('build still ran'),
        'electron:compile': ok('electron compile still ran')
      });
      await writeRepositoryRootBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'desktop');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate:desktop] failed: lint:desktop:full');
      expect(result.stdout).toContain('[quality-gate:desktop] failed: typecheck:desktop');
      expect(result.stdout).toContain('desktop test still ran');
      expect(result.stdout).toContain('quality core test still ran');
      expect(result.stdout).toContain('quality preview test still ran');
      expect(result.stdout).toContain('build still ran');
      expect(result.stdout).toContain('[quality-gate:desktop] collected failures summary:');
      expect(result.stdout).not.toContain('[quality-gate:desktop] all checks passed.');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('reports every failed release-build parallel step in collected mode', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-collect-'));
    try {
      await writePackageJson(tempRoot, {
        'test:quality:preview': ok('quality preview test still ran'),
        'build:vite-only': ok('build still ran'),
        'electron:compile': fail('electron compile failed details'),
        'android:web:build': ok('android web build still ran')
      });
      await writeRepositoryRootBoundaryScript(tempRoot);

      const result = await runTargetGate(tempRoot, 'release-build');

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('quality preview test still ran');
      expect(result.stdout).toContain('android web build still ran');
      expect(result.stdout).toContain('[quality-gate:release-build] electron:compile failed:');
      expect(result.stdout).toContain('[quality-gate:release-build] collected failures summary:');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60000);
});
