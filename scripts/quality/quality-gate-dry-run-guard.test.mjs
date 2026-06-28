// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runManagedCommand } from './quality-gate-fast.test-support.mjs';

const script = [
  'source "$QUALITY_GATE_LIB_SCRIPT"',
  'run_quality_gate_script "quality-gate:test" "npm" "test:example"'
].join('\n');

async function writePackage(rootDir, name = 'not-a-quality-gate-fixture') {
  await writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ name, private: true, scripts: { 'test:example': 'node -e "console.log(123)"' } }, null, 2)}\n`,
    'utf8'
  );
}

describe('quality gate dry-run guard', () => {
  it('rejects dry-run outside an explicit test context or fixture package', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-dry-run-'));
    try {
      await writePackage(tempRoot);

      const result = await runManagedCommand('bash', ['-lc', script], {
        cwd: tempRoot,
        env: {
          QUALITY_GATE_LIB_SCRIPT: path.resolve('scripts/quality/quality-gate-lib.sh'),
          QUALITY_GATE_TEST_DRY_RUN_STEPS: '1'
        }
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('QUALITY_GATE_TEST_DRY_RUN_STEPS is only allowed');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('allows dry-run in explicit quality gate test context', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-dry-run-'));
    try {
      await writePackage(tempRoot);

      const result = await runManagedCommand('bash', ['-lc', script], {
        cwd: tempRoot,
        env: {
          QUALITY_GATE_LIB_SCRIPT: path.resolve('scripts/quality/quality-gate-lib.sh'),
          QUALITY_GATE_TEST_CONTEXT: '1',
          QUALITY_GATE_TEST_DRY_RUN_STEPS: '1'
        }
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('dry-run step: test:example');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
