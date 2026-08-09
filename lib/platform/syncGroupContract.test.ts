import { expect, it } from 'vitest';

import { isEmptySyncGroupLibrary } from './syncGroupContract.js';

it('admits only a structurally empty library to a Sync Group', () => {
  const empty = { attachment_count: 0, content_blob_count: 0, node_count: 0, review_log_count: 0, timeline_id: null };
  expect(isEmptySyncGroupLibrary(empty)).toBe(true);
  expect(isEmptySyncGroupLibrary({ ...empty, node_count: 1 })).toBe(false);
  expect(isEmptySyncGroupLibrary({ ...empty, timeline_id: 'timeline-existing' })).toBe(false);
});
