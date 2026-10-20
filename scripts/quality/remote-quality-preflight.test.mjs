// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  baseFromRunTitle, resolvePreflightBase, runRemoteQualityPreflight
} from './remote-quality-preflight.mjs';
import { selectPreflightTests } from './remote-quality-preflight-select.mjs';
import { runRemoteQuality } from './remote-quality.mjs';
import { createRunner, SHA } from './remote-quality-test-support.mjs';

const BASE = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

const SOURCES = {
  'scripts/quality/remote-quality.test.mjs': "import { x } from './remote-quality-args.mjs';",
  'scripts/quality/workflow-contract.test.mjs': "read('.github/workflows/remote-quality.yml')",
  'scripts/quality/unrelated.test.mjs': "import pkg from '../../package.json';",
  'src/features/reader/progress.test.ts': "import { progress } from './progress';",
  'src/features/reader/other.test.ts': "import { other } from './other';"
};

function createGitRunner(changed, overrides = {}) {
  return vi.fn(async (command, args) => {
    if (args[0] === 'diff') return { code: 0, stderr: '', stdout: `${changed.join('\n')}\n` };
    if (args[0] === 'ls-files') return { code: 0, stderr: '', stdout: Object.keys(SOURCES).join('\n') };
    return overrides[args[0]]?.(args) ?? { code: 1, stderr: 'unexpected', stdout: '' };
  });
}

function select(changedFiles) {
  return selectPreflightTests({
    changedFiles, readText: (file) => SOURCES[file], testFiles: Object.keys(SOURCES)
  }).map(({ file }) => file);
}

describe('remote quality preflight selection', () => {
  it('links tests that read a changed file by path or import it by distinctive name', () => {
    expect(select(['.github/workflows/remote-quality.yml', 'scripts/quality/remote-quality-args.mjs']))
      .toEqual(['scripts/quality/workflow-contract.test.mjs', 'scripts/quality/remote-quality.test.mjs']);
  });

  it('links sibling tests and changed tests, but not generic or longer names', () => {
    expect(select(['src/features/reader/progress.ts', 'package.json', 'scripts/quality/remote-quality.mjs',
      'src/features/reader/other.test.ts']))
      .toEqual(['src/features/reader/other.test.ts', 'scripts/quality/remote-quality.test.mjs',
        'src/features/reader/progress.test.ts']);
  });
});

describe('remote quality preflight base', () => {
  it('accepts green runs of the same scope or full only', () => {
    expect(baseFromRunTitle(`Dev Quality Check (shared) @ ${BASE} via x`, 'shared')).toBe(BASE);
    expect(baseFromRunTitle(`Dev Quality Check (full) @ ${BASE} via x`, 'ios')).toBe(BASE);
    expect(baseFromRunTitle(`Dev Quality Check (desktop) @ ${BASE} via x`, 'ios')).toBeNull();
  });

  it('skips green runs whose commit is not available locally', async () => {
    const runner = vi.fn(async (command, args) => {
      if (command === 'gh') return { code: 0, stderr: '', stdout: JSON.stringify([
        `Dev Quality Check (full) @ ${OTHER} via x`, `Dev Quality Check (full) @ ${BASE} via x`
      ]) };
      return { code: args[2].startsWith(BASE) ? 0 : 1, stderr: '', stdout: '' };
    });
    await expect(resolvePreflightBase({ repo: 'o/r', runner, scope: 'full' })).resolves.toBe(BASE);
  });
});

describe('remote quality preflight run', () => {
  const changed = ['.github/workflows/remote-quality.yml'];
  const options = {
    base: BASE, fingerprint: () => null, log: () => {}, readText: (file) => SOURCES[file],
    recordFile: '/nonexistent/remote-preflight-record.json'
  };

  it('runs related tests locally and passes when they pass', async () => {
    const runTests = vi.fn(async () => {});
    await runRemoteQualityPreflight({ ...options, runTests, runner: createGitRunner(changed) });
    expect(runTests).toHaveBeenCalledWith(['scripts/quality/workflow-contract.test.mjs']);
  });

  it('blocks with stale-versus-regression guidance when a related test fails', async () => {
    const runTests = vi.fn(async () => { throw new Error('related tests failed'); });
    await expect(runRemoteQualityPreflight({ ...options, runTests, runner: createGitRunner(changed) }))
      .rejects.toThrow(/assertion is stale[\s\S]*or the code regressed/u);
  });

  it('lists related tests without running them', async () => {
    const runTests = vi.fn();
    const lines = [];
    await runRemoteQualityPreflight({
      ...options, list: true, log: (line) => lines.push(line), runTests, runner: createGitRunner(changed)
    });
    expect(runTests).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('workflow-contract.test.mjs <- path:.github/workflows/remote-quality.yml');
  });

  it('runs only up to the cap and leaves the rest to remote', async () => {
    const runTests = vi.fn(async () => {});
    const result = await runRemoteQualityPreflight({
      ...options, cap: 1, runTests,
      runner: createGitRunner([...changed, 'scripts/quality/remote-quality-args.mjs'])
    });
    expect(runTests).toHaveBeenCalledWith(['scripts/quality/workflow-contract.test.mjs']);
    expect(result.deferred.map(({ file }) => file)).toEqual(['scripts/quality/remote-quality.test.mjs']);
  });
});

describe('remote quality dispatch preflight', () => {
  const dispatched = (runner) => runner.mock.calls.some(([, args]) => args.some((arg) => arg.includes('/dispatches')));

  it('blocks dispatch when the preflight fails', async () => {
    const { runner } = createRunner();
    const preflight = vi.fn(async () => { throw new Error('remote preflight failed'); });
    await expect(runRemoteQuality({ args: ['--scope', 'shared'], preflight, runner }))
      .rejects.toThrow('remote preflight failed');
    expect(preflight).toHaveBeenCalledWith(expect.objectContaining({ head: SHA, scope: 'shared' }));
    expect(dispatched(runner)).toBe(false);
  });

  it('dispatches without preflight when explicitly skipped', async () => {
    const { runner } = createRunner();
    const preflight = vi.fn();
    await runRemoteQuality({ args: ['--scope', 'shared', '--skip-preflight'], preflight, runner });
    expect(preflight).not.toHaveBeenCalled();
    expect(dispatched(runner)).toBe(true);
  });
});
