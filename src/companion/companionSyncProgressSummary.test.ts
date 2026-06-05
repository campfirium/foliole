import { describe, expect, it } from 'vitest';

import { translate } from '../shared/localization/translations';

import { formatCompanionSyncProgressSummary } from './companionSyncProgressSummary';

const t = translate.bind(null, 'en');

function expectReviewQueueBodyProgressAfterActiveTopic() {
  const summary = formatCompanionSyncProgressSummary({
    completed: 3,
    completedBytes: 1048576,
    contentBreakdown: {
      activeTopicBodies: 1,
      dueReviewBodies: 7,
      externalDocumentBodies: 23,
      nestedTopicBodies: 156,
      topLevelTopicBodies: 64,
      topicBodies: 220
    },
    phase: 'content',
    total: 616,
    totalBytes: 2097152
  }, t);

  expect(summary.title).toBe('Review resources');
  expect(summary.status).toBe('2/7');
  expect(summary.detail).toBe('Review queue: 7 bodies');
}

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

function expectRemainingBodyBacklogLabel() {
  const summary = formatCompanionSyncProgressSummary({
    completed: 0,
    completedBytes: 0,
    mode: 'remaining',
    phase: 'content',
    total: 5,
    totalBytes: 5242880
  }, t);

  expect(summary.title).toBe('Body downloads');
  expect(summary.status).toBe('5 left - 0 B/5.0 MB');
}

describe('formatCompanionSyncProgressSummary', () => {
  it('subtracts current topic bodies before showing review queue body progress', expectReviewQueueBodyProgressAfterActiveTopic);

  it('subtracts current topic attachments before showing review queue attachment progress', expectReviewQueueAttachmentProgressAfterActiveTopic);

  it('labels idle remaining body backlog as left to download', expectRemainingBodyBacklogLabel);
});
