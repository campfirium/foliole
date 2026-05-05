import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionBottomTabBar } from './CompanionFloatingBars';
import { DEFAULT_COMPANION_TAB_CONFIG } from './CompanionTabsConfig';

describe('CompanionBottomTabBar', () => {
  it('shows the library index stage above the bottom tabs', () => {
    render(
      <CompanionBottomTabBar
        activeAction="recent"
        activeSecondaryDestinationId={null}
        config={DEFAULT_COMPANION_TAB_CONFIG}
        onAction={vi.fn()}
        onSecondaryDestination={vi.fn()}
        syncProgress={{ completed: 820, phase: 'structure', total: 820 }}
        visible
      />
    );

    expect(screen.getByText('Stage 1 · Library index')).toBeInTheDocument();
    expect(screen.getByText('820/820')).toBeInTheDocument();
  });

  it('shows sync phase and body progress above the bottom tabs', () => {
    render(
      <CompanionBottomTabBar
        activeAction="recent"
        activeSecondaryDestinationId={null}
        config={DEFAULT_COMPANION_TAB_CONFIG}
        onAction={vi.fn()}
        onSecondaryDestination={vi.fn()}
        syncProgress={{
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
        }}
        visible
      />
    );

    expect(screen.getByLabelText('Sync progress')).toBeInTheDocument();
    expect(screen.getByText('Stage 3 · Topic bodies')).toBeInTheDocument();
    expect(screen.getByText('128/616 - 1.0 MB/2.0 MB')).toBeInTheDocument();
    expect(screen.getByText('Top-level 64 · Nested 156 · External 23 · Due review 7')).toBeInTheDocument();
  });

  it('shows attachment resource progress above the bottom tabs', () => {
    render(
      <CompanionBottomTabBar
        activeAction="recent"
        activeSecondaryDestinationId={null}
        config={DEFAULT_COMPANION_TAB_CONFIG}
        onAction={vi.fn()}
        onSecondaryDestination={vi.fn()}
        syncProgress={{ completed: 4, completedBytes: 2097152, phase: 'attachment', total: 12, totalBytes: 8388608 }}
        visible
      />
    );

    expect(screen.getByText('Stage 4 · Attachments')).toBeInTheDocument();
    expect(screen.getByText('4/12 - 2.0 MB/8.0 MB')).toBeInTheDocument();
  });
});
