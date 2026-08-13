import { afterEach, expect, it, vi } from 'vitest';

import {
  ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT,
  reportDesktopSyncGroupCursorCommitted
} from './desktopSyncGroupCursorCommit.js';

afterEach(() => { vi.restoreAllMocks(); });

it('reports a committed cursor without changing the ordinary sync path', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const event = { cursor: 124, peerDeviceId: 'provider-b' };

  await reportDesktopSyncGroupCursorCommitted(event, {});

  expect(info).toHaveBeenCalledWith('[sync-group] receive cursor committed', event);
});

it('holds an acceptance session after reporting its committed cursor', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  let settled = false;

  void reportDesktopSyncGroupCursorCommitted(
    { cursor: 124, peerDeviceId: 'provider-b' },
    { [ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT]: '1' }
  ).then(() => { settled = true; });
  await Promise.resolve();

  expect(settled).toBe(false);
});
