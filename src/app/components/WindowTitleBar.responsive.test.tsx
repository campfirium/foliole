import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/windowControls', () => ({
  closeMainWindow: vi.fn(),
  isWindowControlsAvailable: () => true,
  minimizeMainWindow: vi.fn(),
  onMainWindowResized: vi.fn(async () => undefined),
  queryMainWindowMaximized: vi.fn(async () => false),
  toggleMainWindowMaximize: vi.fn()
}));

import { WindowTitleBar } from './WindowTitleBar';

function renderTitleBar(overrides: Partial<ComponentProps<typeof WindowTitleBar>> = {}) {
  return render(
    <WindowTitleBar
      activeRightPanelId="dev"
      centerTitle={null}
      isListCollapsed={false}
      isRightSidebarCollapsed={false}
      isTrashViewOpen={false}
      listWidth={320}
      onOpenTrashView={() => undefined}
      onSelectRightPanel={() => undefined}
      onToggleListVisibility={() => undefined}
      onToggleRightSidebarVisibility={() => undefined}
      rightSidebarWidth={320}
      {...overrides}
    />
  );
}

it('keeps only the right sidebar toggle visible below the sidebar breakpoint', () => {
  const { container } = renderTitleBar();

  expect(container.querySelector('.window-titlebar-right-zone')).toHaveClass('max-[1279px]:hidden');
  expect(screen.getByRole('button', { name: 'Toggle right sidebar' })).toBeInTheDocument();
});

it('renders only the right sidebar toggle when the sidebar is manually collapsed', () => {
  renderTitleBar({ isRightSidebarCollapsed: true });

  expect(screen.getByRole('button', { name: 'Toggle right sidebar' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review queue panel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Source info panel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Highlights panel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Dev panel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'More right sidebar panels' })).not.toBeInTheDocument();
});
