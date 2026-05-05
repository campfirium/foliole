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
        syncProgress={{ completed: 128, phase: 'content', total: 616 }}
        visible
      />
    );

    expect(screen.getByLabelText('Sync progress')).toBeInTheDocument();
    expect(screen.getByText('Topic body cache')).toBeInTheDocument();
    expect(screen.getByText('128/616')).toBeInTheDocument();
  });

  it('shows attachment resource progress above the bottom tabs', () => {
    render(
      <CompanionBottomTabBar
        activeAction="recent"
        activeSecondaryDestinationId={null}
        config={DEFAULT_COMPANION_TAB_CONFIG}
        onAction={vi.fn()}
        onSecondaryDestination={vi.fn()}
        syncProgress={{ completed: 4, phase: 'attachment', total: 12 }}
        visible
      />
    );

    expect(screen.getByText('Attachment files')).toBeInTheDocument();
    expect(screen.getByText('4/12')).toBeInTheDocument();
  });
});
