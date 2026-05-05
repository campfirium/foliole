// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUALITY_GATE_FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-fast.sh');
const QUALITY_GATE_LIB_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-lib.sh');

function runQualityGate(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('bash', [QUALITY_GATE_FAST_SCRIPT], {
      cwd,
      env: { ...process.env, ...env }
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

function runGuardedCommand(command, env = {}) {
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
        QUALITY_GATE_TEST_MAX_RSS_KB: '1048576',
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

function isPidAlive(pid) {
  const result = spawnSync('bash', ['-lc', `kill -0 ${pid}`], { encoding: 'utf8' });
  return result.status === 0;
}

async function writePackageJson(rootDir, scripts) {
  const packageJson = {
    name: 'quality-gate-fixture',
    private: true,
    scripts
  };
  await writeFile(path.join(rootDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

describe('quality-gate-fast.sh', () => {
  it('suppresses successful script output in fail-only mode', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'lint ok\')"',
        typecheck: 'node -e "console.log(\'typecheck ok\')"',
        test: 'node -e "console.log(\'test ok\')"'
      });

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_LOG_MODE: 'fail-only'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] all checks passed.');
      expect(result.stdout).not.toContain('lint ok');
      expect(result.stdout).not.toContain('typecheck ok');
      expect(result.stdout).not.toContain('test ok');
      expect(result.stdout).not.toContain('running: lint');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('reports the failed script in fail-only mode', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'lint ok\')"',
        typecheck: 'node -e "console.log(\'typecheck failed details\'); process.exit(1)"',
        test: 'node -e "console.log(\'test ok\')"'
      });

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_LOG_MODE: 'fail-only'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('[quality-gate-fast] typecheck failed:');
      expect(result.stdout).not.toContain('lint ok');
      expect(result.stdout).not.toContain('test ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails fast and clears descendant processes when a guarded test exceeds the timeout', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    const pidFile = path.join(tempRoot, 'child.pid');
    try {
      const result = await runGuardedCommand(
        `(sleep 30) & child=$!; echo "$child" > "${pidFile}"; wait`,
        { QUALITY_GATE_TEST_TIMEOUT_SECONDS: '2' }
      );

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('failed: test exceeded timeout (2s)');
      const lingeringPid = Number.parseInt((await readFile(pidFile, 'utf8')).trim(), 10);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
      expect(Number.isNaN(lingeringPid)).toBe(false);
      expect(isPidAlive(lingeringPid)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('fails fast when a guarded test exceeds the memory limit', async () => {
    const result = await runGuardedCommand(
      'node -e \'const chunks=[]; setInterval(() => chunks.push(Buffer.alloc(16 * 1024 * 1024)), 10)\'',
      {
        QUALITY_GATE_TEST_TIMEOUT_SECONDS: '20',
        QUALITY_GATE_TEST_MAX_RSS_KB: '32768'
      }
    );

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('failed: test exceeded memory limit');
    expect(result.stdout).toContain('peak test memory:');
  }, 15000);

  it('applies timeout limits to the lint step too', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    const pidFile = path.join(tempRoot, 'lint.pid');
    try {
      await writePackageJson(tempRoot, {
        lint: `bash -lc '(sleep 30) & child=$!; echo "$child" > "${pidFile}"; wait'`,
        typecheck: 'node -e "console.log(\'typecheck ok\')"',
        test: 'node -e "console.log(\'test ok\')"'
      });

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_LINT_TIMEOUT_SECONDS: '2',
        QUALITY_GATE_TYPECHECK_TIMEOUT_SECONDS: '20'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('lint failed:');
      expect(result.stdout).toContain('failed: lint exceeded timeout (2s)');
      const lingeringPid = Number.parseInt((await readFile(pidFile, 'utf8')).trim(), 10);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
      expect(Number.isNaN(lingeringPid)).toBe(false);
      expect(isPidAlive(lingeringPid)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('applies memory limits to the typecheck step too', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'lint ok\')"',
        typecheck: 'node -e "const chunks=[]; setInterval(() => chunks.push(Buffer.alloc(16 * 1024 * 1024)), 10)"',
        test: 'node -e "console.log(\'test ok\')"'
      });

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_TYPECHECK_TIMEOUT_SECONDS: '20',
        QUALITY_GATE_TYPECHECK_MAX_RSS_KB: '32768'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('typecheck failed:');
      expect(result.stdout).toContain('failed: typecheck exceeded memory limit');
      expect(result.stdout).toContain('peak typecheck memory:');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});
