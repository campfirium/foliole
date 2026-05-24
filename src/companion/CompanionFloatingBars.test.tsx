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

  it('renders the active tab with the accent pill so the indicator wraps only the icon', () => {
    renderBottomBar();

    const activeTab = document.querySelector('button[aria-current="page"]');
    expect(activeTab).not.toBeNull();
    const pill = activeTab?.querySelector('span');
    expect(pill?.className).toContain('bg-companion-accent-soft');
    expect(pill?.className).toContain('rounded-full');

    const inactiveTab = screen.getByRole('button', { name: 'Flow' });
    const inactivePill = inactiveTab.querySelector('span');
    expect(inactivePill?.className ?? '').not.toContain('bg-companion-accent-soft');
  });
});
