import { render, screen } from '@testing-library/react';
import { ListFilter, X } from 'lucide-react';
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

  expect(screen.getByRole('button', { name: 'Settings' }).closest('header')).toContainElement(screen.getByText('Sync status'));
  expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('data-testid', 'companion-top-bar-back');
  expect(screen.getByRole('heading', { name: 'Device sync' })).toBeInTheDocument();
}

describe('CompanionTopBar', () => {
  it('keeps a single borderless toolbar', () => {
    const { container } = render(<CompanionTopBar title="Browse" visible />);
    const header = container.querySelector('header');
    expect(header?.className).not.toContain('border-b');
    expect(header?.className).toContain('px-2.5');
    expect(header?.className).toContain('-mx-5');
  });

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

    expect(screen.getByRole('button', { name: 'Back' }).closest('header')).toContainElement(screen.getByRole('button', { name: 'Capture' }));
  });

  it('retains both review actions with touch targets', () => {
    const { container } = render(
      <CompanionTopBar
        density="compact"
        leftAction={{ icon: X, label: 'Exit', onClick: vi.fn() }}
        rightAction={{ icon: ListFilter, label: 'Only review', onClick: vi.fn() }}
        visible
      />
    );

    expect(container.querySelector('header')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toHaveAttribute('data-testid', 'companion-top-bar-left-action');
    expect(screen.getByRole('button', { name: 'Exit' }).className).toContain('h-11');
  });
});
