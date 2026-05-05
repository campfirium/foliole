import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('renders the standalone performance panel with timing, memory, and cache groups', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'node-performance',
    nodeOrder: ['node-performance'],
    nodesById: {
      'node-performance': createNode({
        id: 'node-performance',
        title: 'Performance node',
        content: '# Prompt body',
        reveal: 'Answer body'
      })
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Performance panel' }));

  expect(screen.getByRole('button', { name: 'Performance panel' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('heading', { name: 'Timing' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Memory' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Cache' })).toBeInTheDocument();
  expect(screen.getByText('Node blocks')).toBeInTheDocument();
  expect(screen.getByText('Image results')).toBeInTheDocument();
});
