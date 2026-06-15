// @vitest-environment node
/* global console, process */

import { describe, expect, it, vi } from 'vitest';

import { createStatusPrinter } from './windows-client-native-status.mjs';

describe('windows client native status', () => {
  it('trusts same-session ready markers without requiring a process main window handle', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const printStatus = createStatusPrinter({
      nativeWindowHealthScript: 'unused.ps1',
      readClientState: () => ({ head: 'head-1', shellPid: 10 }),
      readReadyState: () => ({
        appReady: { head: 'head-1', stage: 'app_ready' },
        bridgeReady: { stage: 'bridge_ready' },
        windowVisible: { pid: 20, stage: 'window_visible' }
      }),
      repoRoot: process.cwd()
    });

    try {
      const status = await printStatus();

      expect(status.ok).toBe(true);
      expect(log).toHaveBeenCalledWith(
        '[windows-restart-client] status: RUNNING trust=OK shell_pid=10 runtime_pid=20 head=head-1'
      );
    } finally {
      log.mockRestore();
    }
  });
});
