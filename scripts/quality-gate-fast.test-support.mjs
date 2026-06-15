// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const QUALITY_GATE_FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-fast.sh');
export const QUALITY_GATE_LIB_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-lib.sh');

export function createQualityGateTempRoot() {
  return mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
}

export function runQualityGate(cwd, env = {}, args = []) {
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

export function runGuardedCommand(command, env = {}) {
  const script = [
    `source "${QUALITY_GATE_LIB_SCRIPT}"`,
    'output_file="$(mktemp)"',
    'set +e',
    'run_command_with_limits "quality-gate-fast" "$output_file" "${QUALITY_GATE_TEST_TIMEOUT_SECONDS}" "${QUALITY_GATE_TEST_MAX_RSS_KB}" "test" bash -lc "$QUALITY_GATE_TEST_COMMAND"',
    'exit_code=$?',
    'set -e',
    'cat "$output_file"',
    'rm -f "$output_file"',
    'exit "$exit_code"'
  ].join('\n');

  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', script], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        QUALITY_GATE_TEST_COMMAND: command,
        QUALITY_GATE_TEST_TIMEOUT_SECONDS: '10',
        QUALITY_GATE_TEST_MAX_RSS_KB: '2097152',
        ...env
      }
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

export function isPidAlive(pid) {
  const result = spawnSync('bash', ['-lc', `kill -0 ${pid}`], { encoding: 'utf8' });
  return result.status === 0;
}

export function normalizeQualityGateLogPath(filePath) {
  if (process.platform !== 'win32') {
    return filePath;
  }

  const result = spawnSync('bash', ['-lc', 'cygpath -w "$QUALITY_GATE_LOG_PATH"'], {
    encoding: 'utf8',
    env: { ...process.env, QUALITY_GATE_LOG_PATH: filePath },
  });
  if (result.status !== 0) {
    return filePath;
  }
  return result.stdout.trim() || filePath;
}

export async function writePackageJson(rootDir, scripts) {
  const fixtureScripts = {
    'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
    ...scripts
  };
  for (const bucket of ['test:desktop', 'test:desktop:src', 'test:desktop:electron', 'test:windows:core', 'test:windows:preview-recovery', 'test:android', 'test:shared', 'test:sync-pack', 'test:quality', 'test:quality:core', 'test:quality:gate', 'test:quality:node', 'test:quality:preview']) {
    fixtureScripts[bucket] ??= scripts['test:full'];
  }
  const packageJson = {
    name: 'quality-gate-fixture',
    private: true,
    scripts: fixtureScripts
  };
  await writeFile(path.join(rootDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

export async function writeExecutable(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, { encoding: 'utf8', mode: 0o755 });
}

export async function writeFixtureFile(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

export async function waitForFile(filePath, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await readFile(filePath, 'utf8');
      return;
    } catch (error) {
      if (!('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
}
