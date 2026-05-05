import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CompanionBottomSyncStatus } from './CompanionBottomSyncStatus';

function expectReviewQueueBodyProgressAfterActiveTopic() {
  render(
    <CompanionBottomSyncStatus
      progress={{
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
      }}
    />
  );

  expect(screen.getByText('Review resources')).toBeInTheDocument();
  expect(screen.getByText('2/7')).toBeInTheDocument();
  expect(screen.queryByText('3/7')).not.toBeInTheDocument();
}

function expectReviewQueueAttachmentProgressAfterActiveTopic() {
  render(
    <CompanionBottomSyncStatus
      progress={{
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
      }}
    />
  );

  expect(screen.getByText('Review resources')).toBeInTheDocument();
  expect(screen.getByText('1/3')).toBeInTheDocument();
  expect(screen.queryByText('2/3')).not.toBeInTheDocument();
}

describe('CompanionBottomSyncStatus priority counts', () => {
  it('subtracts current topic bodies before showing review queue body progress', expectReviewQueueBodyProgressAfterActiveTopic);

  it('subtracts current topic attachments before showing review queue attachment progress', expectReviewQueueAttachmentProgressAfterActiveTopic);
});
