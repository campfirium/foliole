import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useForegroundAutoSync', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('stays quiet and does not start background sync checks', async () => {
    const { useForegroundAutoSync } = await import('./useCompanionWorkspaceAutoSync');
    const tryForegroundAutoSync = vi.fn(async () => undefined);

    renderHook(() =>
      useForegroundAutoSync(
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        {
          endpoint_url: 'http://10.0.2.2:38641',
          last_synced_at: '2026-04-22T12:00:00.000Z',
          remembered_targets: ['http://10.0.2.2:38641'],
          workspace_snapshot: null
        },
        tryForegroundAutoSync
      )
    );

    expect(tryForegroundAutoSync).not.toHaveBeenCalled();
  });
});
