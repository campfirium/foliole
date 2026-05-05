import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionBottomTabBar } from './CompanionFloatingBars';
import { DEFAULT_COMPANION_TAB_CONFIG } from './CompanionTabsConfig';

describe('CompanionBottomTabBar', () => {
  it('shows sync phase and body progress above the bottom tabs', () => {
    render(
      <CompanionBottomTabBar
        activeAction="recent"
        activeSecondaryDestinationId={null}
        config={DEFAULT_COMPANION_TAB_CONFIG}
        onAction={vi.fn()}
        onSecondaryDestination={vi.fn()}
        syncProgress={{ completed: 128, completedBytes: 1048576, phase: 'content', total: 616, totalBytes: 2097152 }}
        visible
      />
    );

    expect(screen.getByLabelText('Sync progress')).toBeInTheDocument();
    expect(screen.getByText('Topic bodies')).toBeInTheDocument();
    expect(screen.getByText('128/616 - 1.0 MB/2.0 MB')).toBeInTheDocument();
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

    expect(screen.getByText('Attachment files')).toBeInTheDocument();
    expect(screen.getByText('4/12 - 2.0 MB/8.0 MB')).toBeInTheDocument();
  });
});
