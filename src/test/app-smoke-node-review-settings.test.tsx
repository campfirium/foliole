import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('shows default desired retention and priority fallbacks on nodes without overrides', () => {
  render(<App />);

  expect(screen.getByText('Node review settings')).toBeInTheDocument();
  expect(screen.getByText('Default · 0.90 from review settings')).toBeInTheDocument();
  expect(screen.getByText('Default · P5 from push queue fallback')).toBeInTheDocument();
  expect(screen.getByText(/desired retention.*memory target/i)).toBeInTheDocument();
});

it('shows inherited values, writes explicit overrides, and falls back to ancestor values again', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'child-node',
    nodeOrder: ['root-node', 'child-node'],
    nodesById: {
      ...state.nodesById,
      'root-node': createNode({
        id: 'root-node',
        title: 'Root node',
        content: '# Root',
        priority: 2,
        desiredRetention: 0.84
      }),
      'child-node': createNode({
        id: 'child-node',
        parentNodeId: 'root-node',
        title: 'Child node',
        content: 'Child content'
      })
    }
  }));

  render(<App />);

  expect(screen.getByText('Inherited · 0.84 from Root node')).toBeInTheDocument();
  expect(screen.getByText('Inherited · P2 from Root node')).toBeInTheDocument();
  expect(screen.getByLabelText('Node desired retention')).toHaveValue('inherit');
  expect(screen.getByLabelText('Node queue priority')).toHaveValue('inherit');

  fireEvent.change(screen.getByLabelText('Node desired retention'), {
    target: { value: '0.81' }
  });
  fireEvent.change(screen.getByLabelText('Node queue priority'), {
    target: { value: '0' }
  });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['child-node']?.desiredRetention).toBe(0.81);
    expect(useWorkspaceStore.getState().nodesById['child-node']?.priority).toBe(0);
  });

  expect(screen.getByText('Explicit · 0.81 on this node')).toBeInTheDocument();
  expect(screen.getByText('Explicit · P0 on this node')).toBeInTheDocument();
  expect(screen.getByText(/P0.*always surfaces first/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Node desired retention'), {
    target: { value: 'inherit' }
  });
  fireEvent.change(screen.getByLabelText('Node queue priority'), {
    target: { value: 'inherit' }
  });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById['child-node']?.desiredRetention).toBeNull();
    expect(useWorkspaceStore.getState().nodesById['child-node']?.priority).toBeNull();
  });

  expect(screen.getByText('Inherited · 0.84 from Root node')).toBeInTheDocument();
  expect(screen.getByText('Inherited · P2 from Root node')).toBeInTheDocument();
});
