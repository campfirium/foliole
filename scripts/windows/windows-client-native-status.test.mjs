// @vitest-environment node
/* global console, process */

import { describe, expect, it, vi } from 'vitest';

import { createStatusPrinter } from './windows-client-native-status.mjs';

describe('windows client native status', () => {
  function fixture(readWindowHealth) {
    return createStatusPrinter({
      nativeWindowHealthScript: 'window-health.ps1',
      readClientState: () => ({ head: 'head-1', shellPid: 10 }),
      readReadyState: () => ({
        appReady: { head: 'head-1', stage: 'app_ready' },
        bridgeReady: { stage: 'bridge_ready' },
        windowVisible: { pid: 20, stage: 'window_visible' }
      }),
      readWindowHealth,
      repoRoot: process.cwd()
    });
  }

  it('trusts same-session ready markers only with a responsive native window', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const readWindowHealth = vi.fn(async () => ({ ok: true, runtimePid: 20, windowHandle: 42 }));
    const printStatus = fixture(readWindowHealth);

    try {
      const status = await printStatus();

      expect(status.ok).toBe(true);
      expect(readWindowHealth).toHaveBeenCalledWith({
        nativeWindowHealthScript: 'window-health.ps1', repoRoot: process.cwd(), runtimePid: 20
      });
      expect(log).toHaveBeenCalledWith(
        '[windows-restart-client] status: RUNNING trust=OK shell_pid=10 runtime_pid=20 head=head-1'
      );
    } finally {
      log.mockRestore();
    }
  });

  it('rejects ready markers when the native window is missing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const printStatus = fixture(async () => ({
      ok: false, reason: 'window-missing', responding: true, runtimePid: 20, windowHandle: 0
    }));
    try {
      const status = await printStatus();
      expect(status.ok).toBe(false);
      expect(log).toHaveBeenCalledWith(
        '[windows-restart-client] status: STOPPED trust=FAILED reason=window-missing runtime_pid=20 window_handle=0 responding=true'
      );
    } finally {
      log.mockRestore();
    }
  });
});
