import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, mockEditorState } from './app-smoke.shared';

const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

function createTextAnchorLink(id: string, originalText: string, from: number) {
  return {
    id,
    kind: 'highlight' as const,
    locator: {
      from,
      originalText,
      to: from + originalText.length
    }
  };
}

async function openRightPanelFromMenu(label: string) {
  fireEvent.keyDown(await screen.findByRole('button', { name: 'More right sidebar panels' }), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(label, 'i') }));
}

it('reveals document highlights from the right sidebar list', async () => {
  const parentContent = '# Parent Needle\n\nSecond mark';
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', title: 'Parent', content: parentContent }),
      'node-3': createNode({
        id: 'node-3',
        parentNodeId: 'node-2',
        title: 'Needle highlight',
        content: 'Needle',
        anchorLink: createTextAnchorLink('1', 'Needle', parentContent.indexOf('Needle'))
      }),
      'node-4': createNode({
        id: 'node-4',
        parentNodeId: 'node-2',
        title: 'Second mark highlight',
        content: 'Second mark',
        anchorLink: createTextAnchorLink('2', 'Second mark', parentContent.indexOf('Second mark'))
      })
    }
  }));

  render(<App />);
  await openRightPanelFromMenu('Highlights');
  fireEvent.click(await screen.findByRole('button', { name: /Second mark/i }));

  const expectedFrom = parentContent.indexOf('Second mark');
  await waitFor(() => {
    expect(mockEditorState.selectionFrom).toBe(expectedFrom);
    expect(mockEditorState.selectionTo).toBe(expectedFrom);
  });
}, RELEASE_GATE_TEST_TIMEOUT_MS);

it('renders the full ancestor path and keeps nested topics navigable', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-7',
    nodeOrder: [INBOX_NODE_ID, 'node-2', 'node-3', 'node-4', 'node-5', 'node-6', 'node-7'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Book', content: '# Book' }),
      'node-3': createNode({ id: 'node-3', kind: 'topic', parentNodeId: 'node-2', title: 'Chapter One', content: '# Chapter One' }),
      'node-4': createNode({ id: 'node-4', kind: 'item', parentNodeId: 'node-3', title: 'Derived card title', content: '# Derived' }),
      'node-5': createNode({ id: 'node-5', kind: 'item', parentNodeId: 'node-4', title: 'Current parent', content: '# Parent' }),
      'node-6': createNode({ id: 'node-6', kind: 'item', parentNodeId: 'node-5', title: 'Current node', content: '# Current' }),
      'node-7': createNode({ id: 'node-7', kind: 'item', parentNodeId: 'node-6', title: 'Final node', content: '# Final' })
    }
  }));

  render(<App />);

  const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
  expect(within(nav).getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: 'Book' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: 'Chapter One' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: 'De...' })).toBeInTheDocument();
  expect(within(nav).getAllByRole('button', { name: 'Cu...' })).toHaveLength(2);
  expect(within(nav).queryByRole('button', { name: 'Final node' })).not.toBeInTheDocument();
});
