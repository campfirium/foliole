import { beforeAll, describe, expect, it } from 'vitest';

import { preloadTranslationCatalog, translate } from '../shared/localization/translations';

import { formatCompanionSyncProgressSummary } from './companionSyncProgressSummary';

const t = translate.bind(null, 'en');

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

function expectReviewQueueAttachmentProgressAfterActiveTopic() {
  const summary = formatCompanionSyncProgressSummary({
    attachmentBreakdown: {
      activeTopicAttachments: 1,
      dueReviewAttachments: 3,
      imageAttachments: 5,
      imageBytes: 1048576,
      otherAttachments: 3,
      otherBytes: 1048576,
      pdfAttachments: 4,
      pdfBytes: 6291456
    },
    completed: 2,
    completedBytes: 2097152,
    phase: 'attachment',
    total: 12,
    totalBytes: 8388608
  }, t);

  expect(summary.title).toBe('Review resources');
  expect(summary.status).toBe('1/3');
  expect(summary.detail).toBe('Review queue: 3 attachments');
}

function expectRemainingAttachmentBacklogLabel() {
  const summary = formatCompanionSyncProgressSummary({
    completed: 0,
    completedBytes: 0,
    mode: 'remaining',
    phase: 'attachment',
    total: 5,
    totalBytes: 5242880
  }, t);

  expect(summary.title).toBe('Attachments');
  expect(summary.status).toBe('5 left - 0 B/5.0 MB');
}

describe('formatCompanionSyncProgressSummary', () => {

  it('subtracts current topic attachments before showing review queue attachment progress', expectReviewQueueAttachmentProgressAfterActiveTopic);

  it('labels idle remaining attachment backlog as left to download', expectRemainingAttachmentBacklogLabel);
});

it('shows an explicit waiting status instead of transfer progress while a peer finishes syncing', () => {
  expect(formatCompanionSyncProgressSummary({ phase: 'waiting', completed: 0, total: null }, t)).toEqual({
    title: 'Waiting for the other device to finish syncing', status: 'Waiting', detail: null
  });
});
