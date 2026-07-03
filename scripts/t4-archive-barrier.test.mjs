import { describe, expect, it } from 'vitest';

import { resolveCommitAgainstRuns } from './t4-archive-barrier.mjs';
import { hasPendingBarrierForRun } from './t4-archive-barrier-state.mjs';

function run(overrides = {}) {
  return {
    conclusion: overrides.conclusion ?? 'success',
    databaseId: overrides.databaseId ?? 1,
    headBranch: overrides.headBranch ?? 'dev',
    headSha: overrides.headSha ?? 'head',
    status: overrides.status ?? 'completed',
    url: 'https://github.com/campfirium/foliole/actions/runs/1',
    workflowName: 'Branch Push Health'
  };
}

function ancestor(commitSha, headSha) {
  return `${headSha}`.split('+').includes(commitSha);
}

describe('T4 archive barrier', () => {
  it('passes a pending commit when the latest successful run covers it', () => {
    expect(resolveCommitAgainstRuns('a', [run({ headSha: 'b+a' })], ancestor)).toMatchObject({
      outcome: 'passed'
    });
  });

  it('waits when the covering run has not completed yet', () => {
    expect(resolveCommitAgainstRuns('a', [run({ headSha: 'b+a', status: 'in_progress' })], ancestor))
      .toMatchObject({ outcome: 'waiting' });
  });

  it('fails only for failure conclusions and ignores cancelled folded runs', () => {
    expect(resolveCommitAgainstRuns('a', [run({ conclusion: 'cancelled', headSha: 'b+a' })], ancestor))
      .toMatchObject({ outcome: 'waiting' });
    expect(resolveCommitAgainstRuns('a', [run({ conclusion: 'failure', headSha: 'b+a' })], ancestor))
      .toMatchObject({ outcome: 'failed' });
  });

  it('does not resolve commits not covered by a run head sha', () => {
    expect(resolveCommitAgainstRuns('a', [run({ headSha: 'b+c' })], ancestor))
      .toMatchObject({ outcome: 'waiting' });
  });

  it('detects whether a failed run belongs to pending barrier commits', () => {
    const state = {
      pending: {
        a: { commitSha: 'a', status: 'pending' },
        recent: { commitSha: 'recent', failedAt: new Date().toISOString(), status: 'failed' },
        stale: { commitSha: 'stale', failedAt: '2026-01-01T00:00:00.000Z', status: 'failed' },
        old: { commitSha: 'old', status: 'passed' }
      }
    };
    expect(hasPendingBarrierForRun(run({ headSha: 'b+a' }), state, ancestor)).toBe(true);
    expect(hasPendingBarrierForRun(run({ headSha: 'b+recent' }), state, ancestor)).toBe(true);
    expect(hasPendingBarrierForRun(run({ headSha: 'b+stale' }), state, ancestor)).toBe(false);
    expect(hasPendingBarrierForRun(run({ headSha: 'b+old' }), state, ancestor)).toBe(false);
  });
});
