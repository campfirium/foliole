import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import { DocumentPriorityControl } from './DocumentPriorityControl';

vi.mock('../../shared/ui', () => ({
  AppDropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AppDropdownMenuContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} role="menu">
      {children}
    </div>
  ),
  AppDropdownMenuItem: ({
    children,
    className,
    disabled,
    title
  }: {
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    title?: string;
  }) => (
    <button className={className} disabled={disabled} role="menuitem" title={title} type="button">
      {children}
    </button>
  ),
  AppDropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}));

it('renders a compact priority picker with only priority values', () => {
  render(
    <DocumentPriorityControl
      activeNodeId="node-1"
      defaultPriority={5}
      editableNodeId="node-1"
      nodesById={{
        'node-1': {
          id: 'node-1',
          kind: 'topic',
          title: 'Topic',
          parentNodeId: null,
          content: '',
          anchorLink: null,
          reveal: null,
          review: null,
          priority: 5,
          createdAt: '',
          updatedAt: ''
        }
      }}
      onPriorityChange={vi.fn()}
    />
  );

  const menu = screen.getByRole('menu');
  expect(within(menu).getAllByRole('menuitem')).toHaveLength(10);
  expect(within(menu).getByRole('menuitem', { name: 'P0' })).toHaveAttribute(
    'title',
    'P0 comes first and is not delayed by priority scaling.'
  );
  expect(within(menu).getByRole('menuitem', { name: 'P5' })).toBeInTheDocument();
  expect(screen.queryByText(/Inherit/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Use inherited value/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/priority scaling/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Current/i)).not.toBeInTheDocument();
});
