import { describe, expect, it, vi } from 'vitest';

import { buildFailureSignature, buildRepairTask, parseArgs, reconcileDirtyWorkspace, runLoop } from './codex-loop.mjs';

const loopTaskEntry = { raw: '[auto] fix loop failure semantics', task: 'fix loop failure semantics', mode: 'auto' };
const createReadMock = (...values) => values.reduce((mock, value) => mock.mockResolvedValueOnce(value), vi.fn());

describe('codex-loop helpers', () => {
  it('parses loop arguments', () => {
    expect(parseArgs(['--complete-gate', '--max-iterations', '3']).completeGate).toBe(true);
    expect(parseArgs(['--complete-gate', '--max-iterations', '3']).maxIterations).toBe(3);
  });

  it('builds a repair task prompt from failure context', () => {
    expect(buildRepairTask('fix scheduler split', 'lint failed')).toContain('Failure context: lint failed');
    expect(buildRepairTask('fix scheduler split', 'lint failed')).toContain('fix scheduler split');
  });

  it('uses the first non-empty line as the failure signature', () => {
    expect(buildFailureSignature(new Error('lint failed\nstack line'))).toBe('lint failed');
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
        readTodoEntryFn: createReadMock(loopTaskEntry, loopTaskEntry, null),
        isGateEntryFn: (entry) => entry?.mode === 'gate',
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

  it('waits when the first pending item is an explicit gate task', async () => {
    const writes = [];
    const runCodexTaskFn = vi.fn().mockResolvedValue(undefined);

    const exitCode = await runLoop(
      { completeGate: false, dryRun: false, maxIterations: 2, model: '' },
      {
        readGitStatusFn: vi.fn().mockResolvedValue(''),
        readTodoEntryFn: vi
          .fn()
          .mockResolvedValueOnce({ raw: '[gate] windows acceptance', task: 'windows acceptance', mode: 'gate' })
          .mockResolvedValueOnce({ raw: '[gate] windows acceptance', task: 'windows acceptance', mode: 'gate' }),
        runCodexTaskFn,
        runQualityGateFn: vi.fn().mockResolvedValue(undefined),
        commitTrackedChangesFn: vi.fn().mockResolvedValue(false),
        buildCommitMessageFn: vi.fn().mockResolvedValue(''),
        isGateEntryFn: (entry) => entry?.mode === 'gate',
        stdout: { write: (value) => writes.push(value) }
      }
    );

    expect(exitCode).toBe(20);
    expect(runCodexTaskFn).not.toHaveBeenCalled();
    expect(writes.join('')).toContain('waiting-for-gate: windows acceptance');
  });

  it('reopens the same task in a fresh round after repair budget exhaustion', async () => {
    const writes = [];
    const appendLoopFailureRecordFn = vi.fn().mockResolvedValue(undefined);
    const runCodexTaskFn = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const runQualityGateFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('lint failed'))
      .mockRejectedValueOnce(new Error('lint failed'))
      .mockRejectedValueOnce(new Error('lint failed'))
      .mockRejectedValueOnce(new Error('lint failed'))
      .mockRejectedValueOnce(new Error('lint failed'))
      .mockRejectedValueOnce(new Error('lint failed'))
      .mockRejectedValueOnce(new Error('typecheck failed'))
      .mockResolvedValue(undefined);

    const exitCode = await runLoop(
      { completeGate: false, dryRun: false, maxIterations: 2, model: '' },
      {
        appendLoopFailureRecordFn,
        buildCommitMessageFn: vi.fn().mockResolvedValue('000141 fix loop failure\n\ncontext: x.\nchange: y.\nintent: z.'),
        commitTrackedChangesFn: vi.fn().mockResolvedValue(true),
        readGitStatusFn: createReadMock('', ' M scripts/codex/codex-loop.mjs', ' M scripts/codex/codex-loop.mjs'),
        readTodoEntryFn: createReadMock(loopTaskEntry, loopTaskEntry, null),
        isGateEntryFn: (entry) => entry?.mode === 'gate',
        runCodexTaskFn,
        runQualityGateFn,
        stdout: { write: (value) => writes.push(value) }
      }
    );

    expect(exitCode).toBe(0);
    expect(appendLoopFailureRecordFn).toHaveBeenCalledTimes(1);
    expect(runCodexTaskFn).toHaveBeenCalledTimes(7);
    expect(writes.join('')).toContain('recorded failed round 1/3: lint failed');
    expect(writes.join('')).toContain('reopening task in a fresh round after failure: lint failed');
    expect(writes.join('')).toContain('iteration 1, round 2/3: fix loop failure semantics');
  });

  it('stops after repeated identical failure signatures across rounds', async () => {
    const writes = [];
    const appendLoopFailureRecordFn = vi.fn().mockResolvedValue(undefined);
    const runCodexTaskFn = vi.fn().mockResolvedValue(undefined);
    const runQualityGateFn = vi.fn().mockRejectedValue(new Error('lint failed'));

    await expect(async () => {
      await runLoop(
        { completeGate: false, dryRun: false, maxIterations: 1, model: '' },
        {
          appendLoopFailureRecordFn,
          buildCommitMessageFn: vi.fn().mockResolvedValue('000141 fix loop failure\n\ncontext: x.\nchange: y.\nintent: z.'),
          commitTrackedChangesFn: vi.fn().mockResolvedValue(true),
          readGitStatusFn: createReadMock('', ' M scripts/codex/codex-loop.mjs', ' M scripts/codex/codex-loop.mjs'),
          readTodoEntryFn: createReadMock(loopTaskEntry, loopTaskEntry),
          isGateEntryFn: (entry) => entry?.mode === 'gate',
          runCodexTaskFn,
          runQualityGateFn,
          stdout: { write: (value) => writes.push(value) }
        }
      );
    }).rejects.toMatchObject({
      code: 'QUALITY_GATE_REPAIR_EXHAUSTED',
      message: expect.stringContaining('quality-gate repair exhausted')
    });

    await runLoop(
      { completeGate: false, dryRun: false, maxIterations: 1, model: '' },
      {
        appendLoopFailureRecordFn: vi.fn().mockResolvedValue(undefined),
        buildCommitMessageFn: vi.fn().mockResolvedValue('000141 fix loop failure\n\ncontext: x.\nchange: y.\nintent: z.'),
        commitTrackedChangesFn: vi.fn().mockResolvedValue(true),
        readGitStatusFn: createReadMock('', ' M scripts/codex/codex-loop.mjs', ' M scripts/codex/codex-loop.mjs'),
        readTodoEntryFn: createReadMock(loopTaskEntry, loopTaskEntry),
        isGateEntryFn: (entry) => entry?.mode === 'gate',
        runCodexTaskFn: vi.fn().mockResolvedValue(undefined),
        runQualityGateFn: vi.fn().mockRejectedValue(new Error('lint failed')),
        stdout: { write: () => {} }
      }
    ).catch((error) => {
      expect(error.message).toContain('task: fix loop failure semantics');
      expect(error.message).toContain('round: 2/3');
      expect(error.message).toContain('failure-signature: lint failed');
      return undefined;
    });

    expect(appendLoopFailureRecordFn).toHaveBeenCalledTimes(2);
    expect(writes.join('')).toContain('recorded failed round 2/3: lint failed');
  });
});
