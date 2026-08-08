import { expect, it } from 'vitest';

import {
  isCompleteProvisioningSummary,
  isEmptySyncGroupLibrary,
  shouldSkipSyncGroupPush
} from './syncGroupContract.js';

it('admits only a structurally empty library to a Sync Group', () => {
  const empty = { attachment_count: 0, content_blob_count: 0, node_count: 0, review_log_count: 0, timeline_id: null };
  expect(isEmptySyncGroupLibrary(empty)).toBe(true);
  expect(isEmptySyncGroupLibrary({ ...empty, node_count: 1 })).toBe(false);
  expect(isEmptySyncGroupLibrary({ ...empty, timeline_id: 'timeline-existing' })).toBe(false);
});

it('blocks Android writes while membership is still provisioning', () => {
  expect(shouldSkipSyncGroupPush('android-capacitor', 'provisioning')).toBe(true);
  expect(shouldSkipSyncGroupPush('android-capacitor', 'active')).toBe(false);
  expect(shouldSkipSyncGroupPush('ios-capacitor', 'provisioning')).toBe(false);
});

it('requires structure, bodies, and attachments to be complete before activation', () => {
  const complete = {
    remainingAttachmentResourceCount: 0, remainingContentBlobCount: 0,
    remainingFailedAttachmentResourceCount: 0, remainingFailedContentBlobCount: 0,
    remainingStructureChangeCount: 0
  };
  expect(isCompleteProvisioningSummary(complete)).toBe(true);
  expect(isCompleteProvisioningSummary({ ...complete, remainingContentBlobCount: 1 })).toBe(false);
  expect(isCompleteProvisioningSummary({ ...complete, remainingAttachmentResourceCount: null })).toBe(false);
});
