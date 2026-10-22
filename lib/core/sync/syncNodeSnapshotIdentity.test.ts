import { expect, it } from 'vitest';

import { textBranch } from '../../../electron/database/topicTextState.testSupport.js';

import { isSyncNodeSnapshotIdentical } from './syncNodeSnapshotIdentity.js';

const stored = textBranch('version', 'Private text').snapshot;

it('ignores the text-derived title and excerpt only once either side no longer keeps the text', () => {
  const redacted = { ...stored, content: null, body_deleted: true, title: '', opening_text: null };
  expect(isSyncNodeSnapshotIdentical(JSON.stringify(stored), redacted)).toBe(true);
  expect(isSyncNodeSnapshotIdentical(JSON.stringify(redacted), stored)).toBe(true);
  expect(isSyncNodeSnapshotIdentical(JSON.stringify(stored), { ...stored, title: 'Changed' })).toBe(false);
  expect(isSyncNodeSnapshotIdentical(JSON.stringify(stored), { ...redacted, parent_id: 'elsewhere' })).toBe(false);
});

it('still compares the title of a version whose body was only retired from history', () => {
  const retired = { ...stored, content: null, body_deleted: true };
  expect(isSyncNodeSnapshotIdentical(JSON.stringify(retired), { ...retired, title: 'Contradictory title' })).toBe(false);
  expect(isSyncNodeSnapshotIdentical(JSON.stringify(retired), retired)).toBe(true);
});
