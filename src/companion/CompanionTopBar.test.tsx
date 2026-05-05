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

  expect(screen.getByRole('button', { name: 'Settings' }).closest('div')).toContainElement(screen.getByText('Sync status'));
  expect(screen.getByRole('heading', { name: 'Device sync' })).toBeInTheDocument();
}

describe('CompanionTopBar', () => {
  it('keeps sync status in the top-right back row on detail pages', expectStatusSlotInBackRow);

  it('keeps browse actions in the back row on nested browse pages', () => {
    render(
      <CompanionTopBar
        backLabel="Back"
        onBack={vi.fn()}
        rightSlot={<button type="button">Capture</button>}
        visible
      />
    );

    expect(screen.getByRole('button', { name: 'Back' }).closest('div')).toContainElement(screen.getByRole('button', { name: 'Capture' }));
  });
});
