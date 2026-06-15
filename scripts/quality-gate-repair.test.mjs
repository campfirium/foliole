// @vitest-environment node
/* global console */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildRepairCommand,
  buildRepairPlan,
  formatRepairPlan,
  parseFailureSummary,
  resolveLatestFailedRunDir,
  runRepairPlan
} from './quality-gate-repair.mjs';

async function writeFailedSummary(logRoot, runId, text) {
  const runDir = path.join(logRoot, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, 'failed.txt'), text, 'utf8');
  return runDir;
}

describe('quality gate release repair', () => {
  it('preserves the original script runtime for failed-test entries', () => {
    const [entry] = parseFailureSummary(`
script=test:release:shared
display=test:release:shared
log=.tmp/logs/quality-gate/run/test_release_shared.parallel.log
rerun=npm run test:release:shared
failed-test=src/shared/One.test.ts
failed-test=src/features/File With Space.test.tsx
`);

    expect(buildRepairCommand(entry)).toBe(
      "npm run test:release:shared -- src/shared/One.test.ts 'src/features/File With Space.test.tsx'"
    );
  });

  it('uses a plain vitest rerun only when no source script is recorded', () => {
    const [entry] = parseFailureSummary(`
display=manual vitest
failed-test=src/shared/One.test.ts
`);

    expect(buildRepairCommand(entry)).toContain('node scripts/run-vitest-with-summary.mjs');
  });

  it('falls back to the recorded rerun command for non-test failures', () => {
    const [entry] = parseFailureSummary(`
script=lint:full
display=lint:full
log=.tmp/logs/quality-gate/run/lint_full.log
rerun=npm run lint:full
`);

    expect(buildRepairCommand(entry)).toBe('npm run lint:full');
  });

  it('selects the latest non-empty failed summary and formats a dry run', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-repair-'));
    const logRoot = path.join(root, 'logs');
    try {
      await writeFailedSummary(logRoot, '20260613-100000-old', '');
      await writeFailedSummary(
        logRoot,
        '20260613-120000-new',
        `
script=test:desktop:electron
display=test:desktop:electron
log=.tmp/logs/quality-gate/run/test_desktop_electron.parallel.log
rerun=npm run test:desktop:electron
failed-test=electron/main/Bridge.test.ts
`
      );

      const latest = resolveLatestFailedRunDir(logRoot);
      const plan = buildRepairPlan({ logRoot });
      const output = formatRepairPlan(plan);

      expect(latest).toBe(path.join(logRoot, '20260613-120000-new'));
      expect(plan.entries).toHaveLength(1);
      expect(output).toContain('run-dir:');
      expect(output).toContain('failed-tests: electron/main/Bridge.test.ts');
      expect(output).toContain('repair: npm run test:desktop:electron -- electron/main/Bridge.test.ts');
      expect(output).toContain('fallback: npm run test:desktop:electron');
      expect(output).toContain('final confirmation after repairs: npm run quality:release:base');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('deduplicates repeated failure blocks by repair command', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-repair-'));
    const logRoot = path.join(root, 'logs');
    try {
      await writeFailedSummary(
        logRoot,
        '20260613-130000-dup',
        `
script=test:release:shared
rerun=npm run test:release:shared
failed-test=src/shared/Dupe.test.ts

script=test:release:shared
rerun=npm run test:release:shared
failed-test=src/shared/Dupe.test.ts
`
      );

      const plan = buildRepairPlan({ logRoot });
      expect(plan.entries).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports an empty plan when no failed summary exists', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quality-gate-repair-'));
    try {
      const plan = buildRepairPlan({ logRoot: path.join(root, 'logs') });
      expect(plan.entries).toEqual([]);
      expect(formatRepairPlan(plan)).toContain('no failed quality gate summary found');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs repair commands sequentially and returns failure when any command fails', async () => {
    const plan = {
      entries: [
        { command: 'echo first', failedTests: [], fallback: '', script: 'lint:full' },
        { command: 'echo second', failedTests: ['src/Fail.test.ts'], fallback: 'npm run test:release:shared', script: 'test:release:shared' }
      ],
      failedPath: '/x/failed.txt',
      runDir: '/x'
    };
    const calls = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const code = await runRepairPlan(plan, async (command) => {
        calls.push(command);
        return command.includes('second') ? 1 : 0;
      });

      expect(calls).toEqual(['echo first', 'echo second']);
      expect(code).toBe(1);
      expect(logSpy).toHaveBeenCalledWith('[quality-gate-repair] fallback bucket: npm run test:release:shared');
      expect(logSpy).toHaveBeenCalledWith('[quality-gate-repair] final confirmation required: npm run quality:release:base');
    } finally {
      logSpy.mockRestore();
    }
  });
});
