import { render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { requestWorkspaceRightPanelOpen } from '../app/components/workspaceRightPanelRequests';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;
const RELEASE_GATE_WAIT_OPTIONS = { timeout: RELEASE_GATE_TEST_TIMEOUT_MS };

it('renders the standalone performance panel with timing, memory, and cache groups', async () => {
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

  requestWorkspaceRightPanelOpen('performance');

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Timing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Memory' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cache' })).toBeInTheDocument();
    expect(screen.getByText('Topic blocks')).toBeInTheDocument();
    expect(screen.getByText('Image results')).toBeInTheDocument();
  }, RELEASE_GATE_WAIT_OPTIONS);
}, RELEASE_GATE_TEST_TIMEOUT_MS);
