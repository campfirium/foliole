// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  decideT7Admission,
  resolveT7Admission,
  selectVerdictCandidates
} from './t7-hosted-quality-admission.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const SELF = 900;

function run(overrides = {}) {
  return { conclusion: 'success', created_at: '2026-10-18T00:00:00Z', head_sha: SHA,
    id: 1, status: 'completed', ...overrides };
}

const decide = (verdicts, runs = [run()]) => decideT7Admission({
  currentRunId: SELF, releaseActive: false, runs, verdicts
});

describe('T7 Hosted Quality admission decision', () => {
  it('skips only on a decisive full verdict', () => {
    expect(decide([{ kind: 'full', verdict: 'passed' }])).toBe('decisive-full-verdict');
    expect(decide([{ kind: 'full', verdict: 'failed' }])).toBe('decisive-full-verdict');
    expect(decide([{ verdict: 'incomplete' }])).toBe('admitted');
    expect(decide([{ kind: 'replay', verdict: 'passed' }, { kind: 'replay', verdict: 'failed' }])).toBe('admitted');
    expect(decide([])).toBe('admitted');
  });

  it('does not count the current run as active, but yields to any other active run', () => {
    expect(decide([], [run({ id: SELF, status: 'in_progress' })])).toBe('admitted');
    expect(decide([], [run({ id: SELF, status: 'in_progress' }), run({ id: 2, status: 'queued' })]))
      .toBe('active-run');
  });

  it('pauses for an active release before anything else', () => {
    expect(decideT7Admission({ currentRunId: SELF, releaseActive: true, runs: [], verdicts: [] }))
      .toBe('release-active');
  });

  it('reads verdicts only for finished success or failure runs of the target SHA', () => {
    const candidates = selectVerdictCandidates([
      run({ id: 1 }), run({ conclusion: 'failure', id: 2 }),
      run({ conclusion: 'cancelled', id: 3 }), run({ id: 4, status: 'in_progress', conclusion: null }),
      run({ head_sha: 'a'.repeat(40), id: 5 }), run({ id: SELF })
    ], SHA, SELF);
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual([1, 2]);
  });
});

function createRunner({ release = false, runsByWorkflow = {} } = {}) {
  return vi.fn(async (_command, args) => {
    const endpoint = args.at(-1);
    if (endpoint.includes('/git/ref/heads/release')) {
      return release ? { code: 0, stderr: '', stdout: '{}' } : { code: 1, stderr: 'HTTP 404: Not Found', stdout: '' };
    }
    const workflow = Object.keys(runsByWorkflow).find((name) => endpoint.includes(`/workflows/${name}/`));
    return { code: 0, stderr: '', stdout: JSON.stringify({ workflow_runs: runsByWorkflow[workflow] ?? [] }) };
  });
}

const env = { FOLIOLE_QUALITY_REPOSITORY: 'campfirium/foliole', FOLIOLE_QUALITY_RUN_ID: String(SELF),
  FOLIOLE_QUALITY_TARGET_SHA: SHA };

describe('T7 Hosted Quality admission resolution', () => {
  it('pauses while the release branch exists without reading run history', async () => {
    const runner = createRunner({ release: true });
    await expect(resolveT7Admission({ env, runner, readVerdict: vi.fn() }))
      .resolves.toEqual({ reason: 'release-active', shouldRun: false });
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('skips a SHA whose scheduled run already produced a decisive full verdict', async () => {
    const runner = createRunner({ runsByWorkflow: { 't7-hosted-quality.yml': [run({ id: 7 }), run({ id: SELF, status: 'in_progress' })] } });
    const readVerdict = vi.fn(() => ({ kind: 'full', verdict: 'failed' }));
    await expect(resolveT7Admission({ env, runner, readVerdict }))
      .resolves.toEqual({ reason: 'decisive-full-verdict', shouldRun: false });
    expect(readVerdict).toHaveBeenCalledWith({ repository: 'campfirium/foliole', runId: 7, targetSha: SHA });
  });

  it('runs when only incomplete or replay evidence exists and the only active run is itself', async () => {
    const runner = createRunner({ runsByWorkflow: {
      'remote-quality.yml': [run({ id: 3 })], 't7-hosted-quality.yml': [run({ id: SELF, status: 'in_progress' })]
    } });
    const readVerdict = vi.fn(() => ({ verdict: 'incomplete' }));
    await expect(resolveT7Admission({ env, runner, readVerdict }))
      .resolves.toEqual({ reason: 'admitted', shouldRun: true });
  });

  it('yields to an active Remote Quality run without reading verdicts', async () => {
    const runner = createRunner({ runsByWorkflow: { 'remote-quality.yml': [run({ id: 3, status: 'in_progress' })] } });
    const readVerdict = vi.fn();
    await expect(resolveT7Admission({ env, runner, readVerdict }))
      .resolves.toEqual({ reason: 'active-run', shouldRun: false });
    expect(readVerdict).not.toHaveBeenCalled();
  });

  it('requires the current run ID so it can exclude itself', async () => {
    await expect(resolveT7Admission({ env: { ...env, FOLIOLE_QUALITY_RUN_ID: '' }, runner: createRunner() }))
      .rejects.toThrow('current run ID');
  });
});
