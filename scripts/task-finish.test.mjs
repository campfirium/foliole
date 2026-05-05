import { describe, expect, it, vi } from 'vitest';

import {
  extractWindowsPreviewStatus,
  runTaskFinish
} from './task-finish.mjs';

describe('task-finish helpers', () => {
  it('extracts the final preview status from script output', () => {
    expect(
      extractWindowsPreviewStatus(
        [
          '[windows-preview] step 1/3: verify electron-dist freshness',
          '[windows-preview] status: SYNCED',
          '[windows-preview] status: STARTED'
        ].join('\n')
      )
    ).toBe('STARTED');
  });

  it('always runs preview as the task finish step', async () => {
    const runWindowsPreview = vi.fn().mockResolvedValue({
      code: 0,
      stderr: '',
      stdout: '[windows-preview] status: STARTED\n'
    });

    const result = await runTaskFinish({
      runWindowsPreview
    });

    expect(runWindowsPreview).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      executed: true,
      exitCode: 0,
      previewStatus: 'STARTED',
      status: 'EXECUTED'
    });
  });

  it('returns failure when preview fails', async () => {
    const runWindowsPreview = vi.fn().mockResolvedValue({
      code: 1,
      stderr: 'preview failed',
      stdout: ''
    });

    const result = await runTaskFinish({
      runWindowsPreview
    });

    expect(result).toMatchObject({
      executed: true,
      exitCode: 1,
      previewStatus: null,
      status: 'FAILED'
    });
  });
});
