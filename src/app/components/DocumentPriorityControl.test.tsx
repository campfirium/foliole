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

it('marks the stored value inactive when a folder enforces its priority', () => {
  const base = { content: '', anchorLink: null, reveal: null, review: null, createdAt: '', updatedAt: '' };
  render(
    <DocumentPriorityControl
      activeNodeId="topic"
      defaultPriority={5}
      editableNodeId="topic"
      nodesById={{
        folder: { ...base, id: 'folder', kind: 'folder', title: 'Category', parentNodeId: null, priority: 3, enforcePriority: true },
        topic: { ...base, id: 'topic', kind: 'topic', title: 'Topic', parentNodeId: 'folder', priority: 7 }
      }}
      onPriorityChange={vi.fn()}
    />
  );

  expect(screen.getByRole('button', { name: 'Priority P3 enforced by Category.' })).toHaveTextContent('P3');
  expect(screen.getByRole('menuitem', { name: 'P7' }).querySelector('svg')).not.toBeNull();
  expect(screen.getByRole('menuitem', { name: 'P3' }).querySelector('svg')).toBeNull();
  expect(screen.getByText('Inactive')).toBeInTheDocument();
});
