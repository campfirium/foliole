import { afterEach, expect, it, vi } from 'vitest';

import {
  ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT,
  reportDesktopSyncGroupObjectCommitted
} from './desktopSyncGroupCursorCommit.js';

afterEach(() => { vi.restoreAllMocks(); });

it('leaves ordinary object notifications unblocked and does not emit an acceptance signal', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  await reportDesktopSyncGroupObjectCommitted({ objectType: 'node', globalId: 'sync-from-zero-a-1' }, {});
  expect(info).not.toHaveBeenCalled();
});

it('holds only the committed dataset node in an acceptance session', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const env = { [ACCEPTANCE_HOLD_AFTER_SYNC_CURSOR_COMMIT]: '1' };
  await reportDesktopSyncGroupObjectCommitted({ objectType: 'setting', globalId: 'sync-from-zero-a-1' }, env);
  await reportDesktopSyncGroupObjectCommitted({ objectType: 'node', globalId: 'special-inbox' }, env);
  expect(info).not.toHaveBeenCalled();
  let settled = false;
  const object = { objectType: 'node', globalId: 'sync-from-zero-a-1' };
  void reportDesktopSyncGroupObjectCommitted(object, env).then(() => { settled = true; });
  await Promise.resolve();
  expect(info).toHaveBeenCalledWith('[sync-group] receive dataset object committed', object);
  expect(settled).toBe(false);
});
