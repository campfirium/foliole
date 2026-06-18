import { describe, expect, it } from 'vitest';

import { explainBridgeBackedControlBlockedReason } from './playwright-desktop-control-blocked-reason.mjs';

describe('explainBridgeBackedControlBlockedReason', () => {
  it('explains single-instance old window lock as a blocked reason', () => {
    expect(
      explainBridgeBackedControlBlockedReason({
        bridgeBreakpoint: {
          kind: 'single_instance_old_window_lock',
          mainProcessPid: 4821,
          readyMarkerPid: 9911
        },
        currentRuntime: {
          appReady: true,
          bridgeAvailable: false,
          bridgeReady: false,
          navigationReady: true,
          pid: 4821,
          preloadPath: null,
          rendererUrl: 'file:///workspace/foliole/dist/desktop/index.html'
        },
        rendererPage: {
          readyState: 'complete',
          rootPresent: true,
          url: 'file:///workspace/foliole/dist/desktop/index.html'
        }
      })
    ).toContain('older runtime');
  });

  it('explains renderer navigation blockers before bridge checks', () => {
    expect(
      explainBridgeBackedControlBlockedReason({
        currentRuntime: {
          appReady: true,
          bridgeAvailable: false,
          bridgeReady: false,
          navigationReady: false,
          rendererUrl: 'about:blank'
        },
        rendererPage: {
          readyState: 'loading',
          rootPresent: false,
          url: 'about:blank'
        }
      })
    ).toContain('renderer has not reached the target page');
  });

  it('explains bridge_ready blockers after bridge becomes available', () => {
    expect(
      explainBridgeBackedControlBlockedReason({
        currentRuntime: {
          appReady: true,
          bridgeAvailable: true,
          bridgeReady: false,
          navigationReady: true,
          preloadPath: '/workspace/foliole/electron/preload.cjs',
          rendererUrl: 'file:///workspace/foliole/dist/desktop/index.html'
        },
        rendererPage: {
          readyState: 'complete',
          rootPresent: true,
          url: 'file:///workspace/foliole/dist/desktop/index.html'
        }
      })
    ).toContain('bridge_ready');
  });

  it('keeps a clear fallback reason when the bridge looks healthy', () => {
    expect(
      explainBridgeBackedControlBlockedReason({
        currentRuntime: {
          appReady: true,
          bridgeAvailable: true,
          bridgeReady: true,
          navigationReady: true,
          preloadPath: '/workspace/foliole/electron/preload.cjs',
          rendererUrl: 'file:///workspace/foliole/dist/desktop/index.html'
        },
        rendererPage: {
          readyState: 'complete',
          rootPresent: true,
          url: 'file:///workspace/foliole/dist/desktop/index.html'
        }
      })
    ).toContain('bridge reports healthy');
  });
});
