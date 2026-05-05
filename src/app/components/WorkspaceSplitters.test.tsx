import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { WorkspaceDualListSplitter } from './WorkspaceDualListSplitter';
import { WorkspaceListSplitter } from './WorkspaceListSplitter';
import { WorkspaceVirtualSectionSplitter } from './WorkspaceVirtualSectionSplitter';

it('uses the shared divider tone for the left item-column boundary', () => {
  const { container } = render(
    <WorkspaceDualListSplitter
      isResizing={false}
      onKeyDown={vi.fn()}
      onPointerDown={vi.fn()}
      width={320}
    />
  );

  expect(screen.getByRole('separator', { name: 'Resize folder list' })).toBeInTheDocument();
  expect(container.querySelector('span')).toHaveClass('before:bg-border');
});

it('uses the shared divider tone for the right item-column boundary', () => {
  const { container } = render(
    <WorkspaceListSplitter
      isCollapsed={false}
      isResizingList={false}
      listWidth={320}
      onResetLayout={vi.fn()}
      onSplitterKeyDown={vi.fn()}
      onSplitterPointerDown={vi.fn()}
    />
  );

  expect(screen.getByRole('separator', { name: 'Resize node list' })).toBeInTheDocument();
  expect(container.querySelector('span')).toHaveClass('before:bg-border');
});

it('renders the virtual section splitter as an inset shared divider', () => {
  const { container } = render(
    <WorkspaceVirtualSectionSplitter
      height={240}
      isResizing={false}
      onKeyDown={vi.fn()}
      onPointerDown={vi.fn()}
    />
  );

  expect(screen.getByRole('separator', { name: 'Resize virtual section' })).toBeInTheDocument();
  expect(container.firstChild).toHaveClass('h-1');
  expect(container.querySelector('span')).toHaveClass('before:bg-border/10', 'before:bottom-0', 'before:left-4', 'before:right-4');
});
