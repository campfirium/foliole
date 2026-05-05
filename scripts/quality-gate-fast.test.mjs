// @vitest-environment node
/* global process */

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUALITY_GATE_FAST_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-fast.sh');
const QUALITY_GATE_LIB_SCRIPT = path.join(REPO_ROOT, 'scripts', 'quality-gate-lib.sh');

function runQualityGate(cwd, env = {}, args = []) {
  return new Promise((resolve) => {
    const child = spawn('bash', [QUALITY_GATE_FAST_SCRIPT, ...args], {
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

async function writeExecutable(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, { encoding: 'utf8', mode: 0o755 });
}

async function writeFixtureFile(rootDir, relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
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
  }, 15000);

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
  }, 15000);

  it('prints the full failure log path and preserves the log file', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'lint ok\')"',
        typecheck: 'node -e "console.log(\'saved failure details\'); process.exit(1)"',
        test: 'node -e "console.log(\'test ok\')"'
      });

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_LOG_MODE: 'fail-only'
      });
      const match = result.stdout.match(/\[quality-gate-fast\] full log: (.+\.log)/);

      expect(result.code).toBe(1);
      expect(match).not.toBeNull();
      await access(match[1]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('fails fast and clears descendant processes when a guarded test exceeds the timeout', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    const pidFile = path.join(tempRoot, 'child.pid');
    try {
      const result = await runGuardedCommand(
        `(sleep 30) & child=$!; echo "$child" > "${pidFile}"; wait`,
        { QUALITY_GATE_TEST_TIMEOUT_SECONDS: '4' }
      );

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('failed: test exceeded timeout (4s)');
      expect(result.stdout).toContain('stalled after:');
      await waitForFile(pidFile);
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
    expect(result.stdout).toContain('stalled after:');
    expect(result.stdout).toContain('peak test memory:');
  }, 15000);

  it('prints waiting progress while a guarded command is still running', async () => {
    const result = await runGuardedCommand(
      'sleep 2',
      {
        QUALITY_GATE_HEARTBEAT_SECONDS: '1',
        QUALITY_GATE_TEST_TIMEOUT_SECONDS: '10'
      }
    );

    expect(result.stdout).toMatch(
      /\[quality-gate-fast\] waiting: test still running \([0-9]+s elapsed, peak test memory [0-9]+ KiB\)/
    );
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
        QUALITY_GATE_LINT_TIMEOUT_SECONDS: '4',
        QUALITY_GATE_TYPECHECK_TIMEOUT_SECONDS: '20'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('lint failed:');
      expect(result.stdout).toContain('failed: lint exceeded timeout (4s)');
      await waitForFile(pidFile);
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

  it('uses the light level for local component changes and skips related tests', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    const typecheckMarker = path.join(tempRoot, 'typecheck.marker');
    const lintMarker = path.join(tempRoot, 'lint.marker');
    try {
      await writePackageJson(tempRoot, {
        'copy:guard': 'node scripts/check-ui-copy-guard.mjs',
        lint: 'node -e "console.log(\'repo lint should stay unused\')"',
        typecheck: `node -e "require('node:fs').writeFileSync('${typecheckMarker}', 'ok')"`,
        test: 'node -e "console.log(\'repo test should stay unused\')"',
        build: 'node -e "console.log(\'repo build should stay unused\')"'
      });
      await writeFixtureFile(tempRoot, 'scripts/check-ui-copy-guard.mjs', 'console.log("copy guard ok");\n');
      await writeFixtureFile(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'console.log("repository root boundary ok");\n');
      await writeExecutable(
        tempRoot,
        'node_modules/.bin/eslint',
        `#!/usr/bin/env bash\nprintf '%s\n' "$*" > "${lintMarker}"\n`
      );
      await writeFixtureFile(
        tempRoot,
        'src/features/image-cloze/components/ImageClozeCardView.tsx',
        'export function ImageClozeCardView() { return null; }\n'
      );

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'src/features/image-cloze/components/ImageClozeCardView.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: light');
      expect(result.stdout).toContain('copy guard ok');
      expect(result.stdout).toContain('repository root boundary ok');
      expect(await readFile(lintMarker, 'utf8')).toContain('src/features/image-cloze/components/ImageClozeCardView.tsx');
      expect(await readFile(typecheckMarker, 'utf8')).toBe('ok');
      expect(result.stdout).not.toContain('repo lint should stay unused');
      expect(result.stdout).not.toContain('repo test should stay unused');
      expect(result.stdout).not.toContain('repo build should stay unused');
      expect(result.stdout).not.toContain('test (related)');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('uses the mid level for props signature changes and runs related tests', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    const typecheckMarker = path.join(tempRoot, 'typecheck.marker');
    const lintMarker = path.join(tempRoot, 'lint.marker');
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'repo lint should stay unused\')"',
        typecheck: `node -e "require('node:fs').writeFileSync('${typecheckMarker}', 'ok')"`,
        test: 'node -e "console.log(\'repo test should stay unused\')"',
        build: 'node -e "console.log(\'repo build should stay unused\')"'
      });
      await writeFixtureFile(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'console.log("repository root boundary ok");\n');
      await writeExecutable(
        tempRoot,
        'node_modules/.bin/eslint',
        `#!/usr/bin/env bash\nprintf '%s\n' "$*" > "${lintMarker}"\n`
      );
      await writeExecutable(
        tempRoot,
        'node_modules/.bin/npx',
        '#!/usr/bin/env bash\nif [[ "$1" == "vitest" ]]; then shift; fi\necho "related test:$*"\n'
      );
      await writeFixtureFile(
        tempRoot,
        'src/app/components/FancyCard.tsx',
        'export interface FancyCardProps { title: string }\nexport function FancyCard(_props: FancyCardProps) { return null; }\n'
      );
      await writeFixtureFile(tempRoot, 'src/app/components/FancyCard.test.tsx', 'export {};\n');

      const result = await runQualityGate(tempRoot, {
        PATH: `${path.join(tempRoot, 'node_modules/.bin')}:${process.env.PATH}`,
        QUALITY_GATE_CHANGED_FILES: 'src/app/components/FancyCard.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: mid');
      expect(result.stdout).toContain('repository root boundary ok');
      expect(await readFile(lintMarker, 'utf8')).toContain('src/app/components/FancyCard.tsx');
      expect(await readFile(typecheckMarker, 'utf8')).toBe('ok');
      expect(result.stdout).toContain('related test:run --pool=threads --maxWorkers=2 src/app/components/FancyCard.test.tsx');
      expect(result.stdout).not.toContain('repo lint should stay unused');
      expect(result.stdout).not.toContain('repo test should stay unused');
      expect(result.stdout).not.toContain('repo build should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('delegates to the full gate when forced', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'full lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'full desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'full android typecheck ok\')"',
        'test:shared': 'node -e "console.log(\'full shared test ok\')"',
        'test:desktop': 'node -e "console.log(\'full desktop test ok\')"',
        'test:android': 'node -e "console.log(\'full android test ok\')"',
        build: 'node -e "console.log(\'full build ok\')"',
        'electron:compile': 'node -e "console.log(\'full electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'full android web build ok\')"',
        'android:sync': 'node -e "console.log(\'full android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'full android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'full android host test ok\')"'
      });

      const result = await runQualityGate(tempRoot, {}, ['--full']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] forcing full quality gate');
      expect(result.stdout).toContain('[quality-gate:full] all checks passed.');
      expect(result.stdout).toContain('full lint ok');
      expect(result.stdout).toContain('full desktop typecheck ok');
      expect(result.stdout).toContain('full android typecheck ok');
      expect(result.stdout).toContain('full shared test ok');
      expect(result.stdout).toContain('full desktop test ok');
      expect(result.stdout).toContain('full android test ok');
      expect(result.stdout).toContain('full build ok');
      expect(result.stdout).toContain('full electron compile ok');
      expect(result.stdout).toContain('full android web build ok');
      expect(result.stdout).not.toContain('full android sync ok');
      expect(result.stdout).not.toContain('full android host lint ok');
      expect(result.stdout).not.toContain('full android host test ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('delegates to the release gate when forced', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'release lint ok\')"',
        'typecheck:desktop': 'node -e "console.log(\'release desktop typecheck ok\')"',
        'typecheck:android': 'node -e "console.log(\'release android typecheck ok\')"',
        'test:shared': 'node -e "console.log(\'release shared test ok\')"',
        'test:desktop': 'node -e "console.log(\'release desktop test ok\')"',
        'test:android': 'node -e "console.log(\'release android test ok\')"',
        build: 'node -e "console.log(\'release build ok\')"',
        'electron:compile': 'node -e "console.log(\'release electron compile ok\')"',
        'android:web:build': 'node -e "console.log(\'release android web build ok\')"',
        'android:sync': 'node -e "console.log(\'release android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'release android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'release android host test ok\')"'
      });

      const result = await runQualityGate(tempRoot, {}, ['--release']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] forcing release quality gate');
      expect(result.stdout).toContain('[quality-gate:release] all checks passed.');
      expect(result.stdout).toContain('release lint ok');
      expect(result.stdout).toContain('release desktop typecheck ok');
      expect(result.stdout).toContain('release android typecheck ok');
      expect(result.stdout).toContain('release shared test ok');
      expect(result.stdout).toContain('release desktop test ok');
      expect(result.stdout).toContain('release android test ok');
      expect(result.stdout).toContain('release build ok');
      expect(result.stdout).toContain('release electron compile ok');
      expect(result.stdout).toContain('release android web build ok');
      expect(result.stdout).toContain('release android sync ok');
      expect(result.stdout).toContain('release android host lint ok');
      expect(result.stdout).toContain('release android host test ok');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);

  it('delegates android path changes to the android gate', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-fast-'));
    try {
      await writePackageJson(tempRoot, {
        lint: 'node -e "console.log(\'full lint should stay unused\')"',
        'lint:android': 'node -e "console.log(\'android lint ok\')"',
        'typecheck:android': 'node -e "console.log(\'android typecheck ok\')"',
        'test:android': 'node -e "console.log(\'android test ok\')"',
        'android:sync': 'node -e "console.log(\'android sync ok\')"',
        'android:host:lint': 'node -e "console.log(\'android host lint ok\')"',
        'android:host:test': 'node -e "console.log(\'android host test ok\')"'
      });
      await writeFixtureFile(tempRoot, 'scripts/check-repository-root-boundary.mjs', 'console.log("boundary ok");\n');

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'src/companion/App.tsx'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[quality-gate-fast] selected level: android');
      expect(result.stdout).toContain('[quality-gate:android] all checks passed.');
      expect(result.stdout).toContain('android lint ok');
      expect(result.stdout).toContain('android host test ok');
      expect(result.stdout).not.toContain('full lint should stay unused');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 15000);
});

async function waitForFile(filePath, timeoutMs = 1000) {
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
