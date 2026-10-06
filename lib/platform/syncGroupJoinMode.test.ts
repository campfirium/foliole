import { expect, it } from 'vitest';

import { parseSyncGroupJoinMode } from './syncGroupJoinMode.js';

it.each(['use-group', 'overwrite'])('accepts the explicit %s overwrite direction', (mode) => {
  expect(parseSyncGroupJoinMode(mode)).toBe(mode);
});

it.each(['merge', undefined, null, 'other'])('rejects removed or unspecified join mode: %s', (mode) => {
  expect(() => parseSyncGroupJoinMode(mode)).toThrow('sync_group_join_mode_required');
});
