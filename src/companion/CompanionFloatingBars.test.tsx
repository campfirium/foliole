import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionBottomTabBar } from './CompanionFloatingBars';
import { DEFAULT_COMPANION_TAB_CONFIG } from './CompanionTabsConfig';

function renderBottomBar() {
  render(
    <CompanionBottomTabBar
      activeAction="recent"
      activeSecondaryDestinationId={null}
      config={DEFAULT_COMPANION_TAB_CONFIG}
      onAction={vi.fn()}
      onSecondaryDestination={vi.fn()}
      visible
    />
  );
}

describe('CompanionBottomTabBar', () => {
  it('shows navigation tabs without a global transfer panel', () => {
    renderBottomBar();

    expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Sync progress')).not.toBeInTheDocument();
  });
});
