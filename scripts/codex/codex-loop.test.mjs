import { describe, expect, it, vi } from 'vitest';

import { buildRepairTask, reconcileDirtyWorkspace } from './codex-loop.mjs';
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
});
