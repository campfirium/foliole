// @vitest-environment node

import { access, rm } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  createQualityGateTempRoot,
  runQualityGate,
  writePackageJson
} from './quality-gate-fast.test-support.mjs';

describe('quality-gate-fast.sh output', () => {
  it('suppresses successful script output in fail-only mode', async () => {
    const tempRoot = await createQualityGateTempRoot();
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
  }, 30000);

  it('reports the failed script in fail-only mode', async () => {
    const tempRoot = await createQualityGateTempRoot();
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
  }, 30000);

  it('prints the full failure log path and preserves the log file', async () => {
    const tempRoot = await createQualityGateTempRoot();
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
  }, 30000);
});
