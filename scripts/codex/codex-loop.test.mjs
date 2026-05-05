import { describe, expect, it, vi } from 'vitest';

import { buildRepairTask, reconcileDirtyWorkspace, runLoop } from './codex-loop.mjs';
import { parseArgs } from './codex-loop.mjs';

describe('codex-loop helpers', () => {
  it('parses loop arguments', () => {
    expect(parseArgs(['--complete-gate', '--max-iterations', '3']).completeGate).toBe(true);
    expect(parseArgs(['--complete-gate', '--max-iterations', '3']).maxIterations).toBe(3);
  });

  it('builds a repair task prompt from failure context', () => {
    expect(buildRepairTask('fix scheduler split', 'lint failed')).toContain('Failure context: lint failed');
    expect(buildRepairTask('fix scheduler split', 'lint failed')).toContain('fix scheduler split');
  });

  it('reconciles a dirty workspace before the main loop continues', async () => {
    const writes = [];
    const runQualityGateFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('lint failed'))
      .mockResolvedValue(undefined);
    const commitTrackedChangesFn = vi.fn().mockResolvedValue(true);
    const runCodexTaskFn = vi.fn().mockResolvedValue(undefined);

    const reconciled = await reconcileDirtyWorkspace(
      'repair current task',
      { model: '' },
      {
        commitTrackedChangesFn,
        buildCommitMessageFn: vi.fn().mockResolvedValue('000136 reconcile dirty workspace\n\ncontext: x.\nchange: y.\nintent: z.'),
        readGitStatusFn: vi.fn().mockResolvedValue(' M file.ts'),
        runCodexTaskFn,
        runQualityGateFn,
        stdout: { write: (value) => writes.push(value) }
      }
    );

    expect(reconciled).toBe(true);
    expect(runQualityGateFn).toHaveBeenCalledTimes(2);
    expect(runCodexTaskFn).toHaveBeenCalledTimes(1);
    expect(commitTrackedChangesFn).toHaveBeenCalledTimes(1);
    expect(writes.join('')).toContain('dirty workspace detected');
    expect(writes.join('')).toContain('repair-round 1/2');
  });

  it('repairs a failed task before leaving a dirty workspace behind', async () => {
    const writes = [];
    const runCodexTaskFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('codex exec failed with code 1'))
      .mockResolvedValue(undefined);
    const readGitStatusFn = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(' M scripts/codex/codex-loop.mjs');
    const runQualityGateFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('lint failed'))
      .mockResolvedValue(undefined);
    const commitTrackedChangesFn = vi.fn().mockResolvedValue(true);

    const exitCode = await runLoop(
      { completeGate: false, dryRun: false, maxIterations: 2, model: '' },
      {
        buildCommitMessageFn: vi.fn().mockResolvedValue('000141 fix loop failure\n\ncontext: x.\nchange: y.\nintent: z.'),
        commitTrackedChangesFn,
        readGitStatusFn,
        readTodoTaskFn: vi
          .fn()
          .mockResolvedValueOnce('fix loop failure semantics')
          .mockResolvedValueOnce('fix loop failure semantics')
          .mockResolvedValueOnce(''),
        runCodexTaskFn,
        runQualityGateFn,
        stdout: { write: (value) => writes.push(value) }
      }
    );

    expect(exitCode).toBe(0);
    expect(runCodexTaskFn).toHaveBeenCalledTimes(2);
    expect(runQualityGateFn).toHaveBeenCalledTimes(2);
    expect(commitTrackedChangesFn).toHaveBeenCalledTimes(1);
    expect(writes.join('')).toContain('task failed with dirty workspace; attempting repair');
    expect(writes.join('')).toContain('repair-round 1/2');
    expect(writes.join('')).toContain('repaired failed task workspace and committed changes');
  });
});
