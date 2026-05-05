import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionBottomTabBar } from './CompanionFloatingBars';
import { DEFAULT_COMPANION_TAB_CONFIG } from './CompanionTabsConfig';

function renderBottomBar(syncProgress: Parameters<typeof CompanionBottomTabBar>[0]['syncProgress']) {
  render(
    <CompanionBottomTabBar
      activeAction="recent"
      activeSecondaryDestinationId={null}
      config={DEFAULT_COMPANION_TAB_CONFIG}
      onAction={vi.fn()}
      onSecondaryDestination={vi.fn()}
      syncProgress={syncProgress}
      visible
    />
  );
}

function expectLibraryIndexStage() {
  renderBottomBar({ completed: 820, phase: 'structure', total: 820 });

  expect(screen.getByText('Stage 1 · Library index')).toBeInTheDocument();
  expect(screen.getByText('820/820')).toBeInTheDocument();
}

function expectUnknownStructureConfirmation() {
  renderBottomBar({ completed: 0, phase: 'structure', total: null });

  expect(screen.getByText('Stage 1 · Library index')).toBeInTheDocument();
  expect(screen.getByText('Checking')).toBeInTheDocument();
  expect(screen.queryByText('0 cached')).not.toBeInTheDocument();
}

function expectReviewQueueBodyStage() {
  renderBottomBar({
    completed: 3,
    completedBytes: 1048576,
    contentBreakdown: {
      activeTopicBodies: 0,
      dueReviewBodies: 7,
      externalDocumentBodies: 23,
      nestedTopicBodies: 156,
      topLevelTopicBodies: 64,
      topicBodies: 220
    },
    phase: 'content',
    total: 616,
    totalBytes: 2097152
  });

  expect(screen.getByLabelText('Sync progress')).toBeInTheDocument();
  expect(screen.getByText('Stage 2 · Review queue')).toBeInTheDocument();
  expect(screen.getByText('3/7')).toBeInTheDocument();
  expect(screen.getByText('Review queue: 7 bodies')).toBeInTheDocument();
  expect(screen.queryByText('3/616 - 1.0 MB/2.0 MB')).not.toBeInTheDocument();
}

function expectActiveTopicBodyStage() {
  renderBottomBar({
    completed: 0,
    completedBytes: 0,
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
  });

  expect(screen.getByText('Current topic')).toBeInTheDocument();
  expect(screen.getByText('0/1')).toBeInTheDocument();
  expect(screen.getByText('Current topic: 1 body')).toBeInTheDocument();
  expect(screen.queryByText('Stage 2 · Review queue')).not.toBeInTheDocument();
}

function expectTopicBodyStageAfterReviewQueue() {
  renderBottomBar({
    completed: 128,
    completedBytes: 1048576,
    contentBreakdown: {
      activeTopicBodies: 0,
      dueReviewBodies: 0,
      externalDocumentBodies: 23,
      nestedTopicBodies: 156,
      topLevelTopicBodies: 64,
      topicBodies: 220
    },
    phase: 'content',
    total: 616,
    totalBytes: 2097152
  });

  expect(screen.getByText('Stage 3 · Topic bodies')).toBeInTheDocument();
  expect(screen.getByText('128/616 - 1.0 MB/2.0 MB')).toBeInTheDocument();
  expect(screen.getByText('Top-level 64 · Nested 156 · External 23 · Due review 0')).toBeInTheDocument();
}

function expectTopicBodyStageAfterDueReviewBodiesComplete() {
  renderBottomBar({
    completed: 7,
    completedBytes: 1048576,
    contentBreakdown: {
      activeTopicBodies: 0,
      dueReviewBodies: 7,
      externalDocumentBodies: 23,
      nestedTopicBodies: 156,
      topLevelTopicBodies: 64,
      topicBodies: 220
    },
    phase: 'content',
    total: 616,
    totalBytes: 2097152
  });

  expect(screen.getByText('Stage 3 · Topic bodies')).toBeInTheDocument();
  expect(screen.getByText('7/616 - 1.0 MB/2.0 MB')).toBeInTheDocument();
  expect(screen.queryByText('Stage 2 · Review queue')).not.toBeInTheDocument();
}

function expectAttachmentStage() {
  renderBottomBar({
    attachmentBreakdown: {
      activeTopicAttachments: 0,
      imageAttachments: 5,
      imageBytes: 1048576,
      otherAttachments: 3,
      otherBytes: 1048576,
      pdfAttachments: 4,
      pdfBytes: 6291456
    },
    completed: 4,
    completedBytes: 2097152,
    phase: 'attachment',
    total: 12,
    totalBytes: 8388608
  });

  expect(screen.getByText('Stage 4 · Attachments')).toBeInTheDocument();
  expect(screen.getByText('4/12 - 2.0 MB/8.0 MB')).toBeInTheDocument();
  expect(screen.getByText('Images 5 · PDFs 4 · Other 3')).toBeInTheDocument();
}

function expectReviewQueueAttachmentStage() {
  renderBottomBar({
    attachmentBreakdown: {
      activeTopicAttachments: 0,
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
  });

  expect(screen.getByText('Stage 2 · Review queue')).toBeInTheDocument();
  expect(screen.getByText('2/3')).toBeInTheDocument();
  expect(screen.getByText('Review queue: 3 attachments')).toBeInTheDocument();
}

function expectActiveTopicAttachmentStage() {
  renderBottomBar({
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
    completed: 0,
    completedBytes: 0,
    phase: 'attachment',
    total: 12,
    totalBytes: 8388608
  });

  expect(screen.getByText('Current topic')).toBeInTheDocument();
  expect(screen.getByText('0/1')).toBeInTheDocument();
  expect(screen.getByText('Current topic: 1 attachment')).toBeInTheDocument();
  expect(screen.queryByText('Stage 2 · Review queue')).not.toBeInTheDocument();
}

function expectAttachmentStageAfterDueReviewAttachmentsComplete() {
  renderBottomBar({
    attachmentBreakdown: {
      activeTopicAttachments: 0,
      dueReviewAttachments: 3,
      imageAttachments: 5,
      imageBytes: 1048576,
      otherAttachments: 3,
      otherBytes: 1048576,
      pdfAttachments: 4,
      pdfBytes: 6291456
    },
    completed: 3,
    completedBytes: 2097152,
    phase: 'attachment',
    total: 12,
    totalBytes: 8388608
  });

  expect(screen.getByText('Stage 4 · Attachments')).toBeInTheDocument();
  expect(screen.getByText('3/12 - 2.0 MB/8.0 MB')).toBeInTheDocument();
  expect(screen.queryByText('Stage 2 · Review queue')).not.toBeInTheDocument();
}

describe('CompanionBottomTabBar', () => {
  it('shows the library index stage above the bottom tabs', expectLibraryIndexStage);

  it('shows unknown structure confirmation without cache wording', expectUnknownStructureConfirmation);

  it('shows Review queue progress while due review bodies are first in the body queue', expectReviewQueueBodyStage);

  it('shows current topic progress before due review bodies', expectActiveTopicBodyStage);

  it('shows topic body progress when no due review bodies remain', expectTopicBodyStageAfterReviewQueue);

  it('leaves Review queue after due review bodies are fetched', expectTopicBodyStageAfterDueReviewBodiesComplete);

  it('shows attachment resource progress above the bottom tabs', expectAttachmentStage);

  it('shows Review queue progress while due review attachments are first in the attachment queue', expectReviewQueueAttachmentStage);

  it('shows current topic attachment progress before due review attachments', expectActiveTopicAttachmentStage);

  it('leaves Review queue after due review attachments are fetched', expectAttachmentStageAfterDueReviewAttachmentsComplete);
});
