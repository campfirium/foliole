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

function expectFsrsPriorityBodyStage() {
  renderBottomBar({
    completed: 128,
    completedBytes: 1048576,
    contentBreakdown: {
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
  expect(screen.getByText('Stage 2 · FSRS priority')).toBeInTheDocument();
  expect(screen.getByText('7/7')).toBeInTheDocument();
  expect(screen.getByText('Due review bodies 7')).toBeInTheDocument();
  expect(screen.queryByText('128/616 - 1.0 MB/2.0 MB')).not.toBeInTheDocument();
}

function expectTopicBodyStage() {
  renderBottomBar({
    completed: 128,
    completedBytes: 1048576,
    contentBreakdown: {
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

function expectAttachmentStage() {
  renderBottomBar({
    attachmentBreakdown: {
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

function expectFsrsPriorityAttachmentStage() {
  renderBottomBar({
    attachmentBreakdown: {
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

  expect(screen.getByText('Stage 2 · FSRS priority')).toBeInTheDocument();
  expect(screen.getByText('2/3')).toBeInTheDocument();
  expect(screen.getByText('Due review attachments 3')).toBeInTheDocument();
}

describe('CompanionBottomTabBar', () => {
  it('shows the library index stage above the bottom tabs', expectLibraryIndexStage);

  it('shows FSRS priority progress while due review bodies are first in the body queue', expectFsrsPriorityBodyStage);

  it('shows topic body progress after the FSRS body priority queue is ready', expectTopicBodyStage);

  it('shows attachment resource progress above the bottom tabs', expectAttachmentStage);

  it('shows FSRS priority progress while due review attachments are first in the attachment queue', expectFsrsPriorityAttachmentStage);
});
