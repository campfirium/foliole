import { describe, expect, it } from 'vitest';

import {
  AUTO_SYNC_MIN_INTERVAL_MS,
  shouldRunForegroundAutoSyncCheck
} from './companionAutoSync';

describe('shouldRunForegroundAutoSyncCheck', () => {
  it('runs only for native foreground checks and respects the minimum interval', () => {
    expect(
      shouldRunForegroundAutoSyncCheck({
        isNativeRuntime: false,
        lastCheckedAt: 0,
        now: 1_000
      })
    ).toBe(false);
    expect(
      shouldRunForegroundAutoSyncCheck({
        isNativeRuntime: true,
        lastCheckedAt: 0,
        now: 1_000
      })
    ).toBe(true);
    expect(
      shouldRunForegroundAutoSyncCheck({
        isNativeRuntime: true,
        lastCheckedAt: 1_000,
        now: 1_000 + AUTO_SYNC_MIN_INTERVAL_MS - 1
      })
    ).toBe(false);
    expect(
      shouldRunForegroundAutoSyncCheck({
        isNativeRuntime: true,
        lastCheckedAt: 1_000,
        now: 1_000 + AUTO_SYNC_MIN_INTERVAL_MS
      })
    ).toBe(true);
  });
});
