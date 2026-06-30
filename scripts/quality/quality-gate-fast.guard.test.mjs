// @vitest-environment node

import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createQualityGateTempRoot,
  isPidAlive,
  runGuardedCommand,
  runQualityGate,
  waitForFile,
  writeExecutable,
  writeFixtureFile,
  writePackageJson
} from './quality-gate-fast.test-support.mjs';

describe('quality-gate-fast.sh guard limits', () => {
  it('fails fast and clears descendant processes when a guarded test exceeds the timeout', async () => {
    const tempRoot = await createQualityGateTempRoot();
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
  }, 45000);

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
    const result = await runGuardedCommand('sleep 2', {
      QUALITY_GATE_HEARTBEAT_SECONDS: '1',
      QUALITY_GATE_TEST_TIMEOUT_SECONDS: '10'
    });

    expect(result.stdout).toMatch(
      /\[quality-gate-fast\] waiting: test still running \([0-9]+s elapsed, peak test memory [0-9]+ KiB\)/
    );
  }, 15000);

  it('reports direct-child fallback when process listing is unavailable', async () => {
    const result = await runGuardedCommand('printf ok', {
      QUALITY_GATE_TEST_PRELUDE: 'quality_gate_has_ps() { return 1; }',
      QUALITY_GATE_TEST_TIMEOUT_SECONDS: '10'
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('process tracking: ps unavailable;');
  }, 15000);

  it('applies timeout limits to the lint step too', async () => {
    const tempRoot = await createQualityGateTempRoot();
    const pidFile = path.join(tempRoot, 'lint.pid');
    try {
      await writePackageJson(tempRoot, {
        typecheck: 'node -e "console.log(\'typecheck ok\')"',
        test: 'node -e "console.log(\'test ok\')"'
      });
      await writeExecutable(
        tempRoot,
        'node_modules/.bin/eslint',
        `#!/usr/bin/env bash\n(sleep 30) & child=$!; echo "$child" > "${pidFile}"; wait\n`
      );
      await writeFixtureFile(tempRoot, 'src/features/image-cloze/components/ImageClozeCardView.tsx', 'export const value = 1;\n');

      const result = await runQualityGate(tempRoot, {
        QUALITY_GATE_CHANGED_FILES: 'src/features/image-cloze/components/ImageClozeCardView.tsx',
        QUALITY_GATE_LINT_TIMEOUT_SECONDS: '4',
        QUALITY_GATE_TYPECHECK_TIMEOUT_SECONDS: '20'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('lint failed:');
      expect(result.stdout).toContain('failed: lint (changed files) exceeded timeout (4s)');
      await waitForFile(pidFile);
      const lingeringPid = Number.parseInt((await readFile(pidFile, 'utf8')).trim(), 10);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
      expect(Number.isNaN(lingeringPid)).toBe(false);
      expect(isPidAlive(lingeringPid)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 30000);

  it('applies memory limits to the typecheck step too', async () => {
    const tempRoot = await createQualityGateTempRoot();
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
