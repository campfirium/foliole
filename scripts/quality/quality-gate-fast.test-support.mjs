// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const QUALITY_GATE_FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-fast.sh');
export const QUALITY_GATE_LIB_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality', 'quality-gate-lib.sh');
const DEFAULT_QUALITY_GATE_TEST_TIMEOUT_MS = 80_000;

export async function createQualityGateTempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
  await writeFixtureFile(root, 'scripts/quality/quality-critical-test-routes.mjs', 'process.exit(0);\n');
  return root;
}

function terminateProcessTree(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 2000 });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process may already have exited.
  }
}

export function runManagedCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: {
        ...process.env,
        QUALITY_GATE_CHANGED_FILES: '',
        QUALITY_GATE_LOG_MODE: 'summary',
        ...options.env
      }
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      resolve({ code, stderr, stdout });
    };
    const timeoutMs = options.timeoutMs ?? DEFAULT_QUALITY_GATE_TEST_TIMEOUT_MS;
    const timer = globalThis.setTimeout(() => {
      stderr += `[quality-gate-test] ${options.label ?? command} exceeded timeout (${timeoutMs}ms)\n`;
      if (child.pid) {
        terminateProcessTree(child.pid);
      }
      finish(1);
    }, timeoutMs);
    timer.unref();
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      stderr += error.message;
      finish(1);
    });
    child.on('close', (code) => {
      finish(code ?? 1);
    });
  });
}

export function runQualityGate(cwd, env = {}, args = [], options = {}) {
  return runManagedCommand('bash', [QUALITY_GATE_FAST_SCRIPT, ...args], {
    cwd,
    env,
    label: 'quality-gate-fast',
    ...options
  });
}

export function runGuardedCommand(command, env = {}) {
  const script = [
    `source "${QUALITY_GATE_LIB_SCRIPT}"`,
    'eval "${QUALITY_GATE_TEST_PRELUDE:-:}"',
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

export function toFixtureShellPath(filePath) {
  return filePath.replaceAll('\\', '/');
}

export async function writePackageJson(rootDir, scripts) {
  const fixtureScripts = {
    'check:android-boundary': 'node -e "console.log(\'android boundary ok\')"',
    'deps:scan': 'node -e "console.log(\'dependency declarations ok\')"',
    ...scripts
  };
  for (const bucket of ['test:desktop', 'test:desktop:src', 'test:desktop:electron', 'test:windows:core', 'test:windows:native-preview', 'test:android', 'test:shared', 'test:sync-pack', 'test:quality', 'test:quality:core', 'test:quality:gate', 'test:quality:gate-integration', 'test:quality:gate-integration:routing', 'test:quality:gate-integration:fast-delegation', 'test:quality:gate-integration:targets', 'test:quality:gate-integration:target-core', 'test:quality:gate-integration:target-failures', 'test:quality:gate-integration:target-collect', 'test:quality:gate-integration:target-telemetry', 'test:quality:gate-integration:release-targets', 'test:quality:gate-integration:release-tail', 'test:quality:node', 'test:quality:preview']) {
    fixtureScripts[bucket] ??= scripts['test:quality'] ?? scripts['test:full'];
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
