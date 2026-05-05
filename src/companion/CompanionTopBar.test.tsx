import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CompanionTopBar } from './CompanionTopBar';

function expectStatusSlotInBackRow() {
  render(
    <CompanionTopBar
      backLabel="Settings"
      onBack={vi.fn()}
      statusSlot={<span>Sync status</span>}
      title="Device sync"
      visible
    />
  );

  expect(screen.getByText('Settings').closest('div')).toContainElement(screen.getByText('Sync status'));
  expect(screen.getByRole('heading', { name: 'Device sync' })).toBeInTheDocument();
}

describe('CompanionTopBar', () => {
  it('keeps sync status in the top-right back row on detail pages', expectStatusSlotInBackRow);
});
