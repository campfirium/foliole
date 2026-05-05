import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

it('renders reading and review leaf variants in the node list', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-qa'],
    nodesById: {
      ...state.nodesById,
      'node-qa': createNode({
        id: 'node-qa',
        title: 'QA Node',
        content: '# QA Node',
        reveal: 'Answer'
      })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  const regularNodeButton = within(listPanel).getByRole('treeitem', { name: 'Welcome to Foliole' });
  const reviewNodeButton = within(listPanel).getByRole('treeitem', { name: 'QA Node' });

  expect(regularNodeButton.querySelector('[data-node-icon="leaf"]')).not.toBeNull();
  expect(
    regularNodeButton.querySelector('[data-node-icon="leaf"]')?.getAttribute('data-node-icon-variant')
  ).toBe('reading');
  expect(
    reviewNodeButton.querySelector('[data-node-icon="leaf"]')?.getAttribute('data-node-icon-variant')
  ).toBe('review');
  expect(
    reviewNodeButton.querySelector('[data-node-icon="leaf"]')?.getAttribute('data-node-icon-state')
  ).toBe('default');
});

it('maps node list icons to queued, current, and dismissed states', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'reading-1',
    nodeOrder: ['reading-1', 'qa-1', 'reading-dismissed'],
    nodesById: {
      ...state.nodesById,
      'reading-1': createNode({ id: 'reading-1', title: 'Reading 1', content: '# Reading 1' }),
      'qa-1': createNode({
        id: 'qa-1',
        title: 'QA Node',
        content: '# QA Node',
        reveal: 'Answer'
      }),
      'reading-dismissed': createNode({
        id: 'reading-dismissed',
        title: 'Dismissed Reading',
        content: '# Dismissed Reading',
        reading: {
          intervalDurationMs: 0,
          intervalGrowthFactor: 1,
          lastHandledAt: FIXED_TIMESTAMP,
          nextAt: FIXED_TIMESTAMP,
          priority: 50,
          readingPosition: 0,
          repetitionCount: 0,
          state: 'dismissed'
        }
      })
    },
    reviewSession: {
      currentNodeId: 'qa-1',
      isAnswerRevealed: false,
      queueNodeIds: ['qa-1', 'reading-1'],
      totalNodeCount: 2
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  const readingNodeButton = within(listPanel).getByRole('treeitem', { name: 'Reading 1' });
  const reviewNodeButton = within(listPanel).getByRole('treeitem', { name: 'QA Node' });
  const dismissedNodeButton = within(listPanel).getByRole('treeitem', { name: 'Dismissed Reading' });

  expect(readingNodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-state',
    'queued'
  );
  expect(reviewNodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-state',
    'current'
  );
  expect(reviewNodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-kind',
    'review'
  );
  expect(dismissedNodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-state',
    'dismissed'
  );
});

it('uses a single custom svg with review mirror fallback', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
    '<svg viewBox="0 0 16 16"><path d="M3 12C7 10 9 6 13 3" fill="none" stroke="#2f855a"/></svg>'
  );
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-qa'],
    nodesById: {
      ...state.nodesById,
      'node-qa': createNode({
        id: 'node-qa',
        title: 'QA Node',
        content: '# QA Node',
        reveal: 'Answer'
      })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  const regularNodeButton = within(listPanel).getByRole('treeitem', { name: 'Welcome to Foliole' });
  const reviewNodeButton = within(listPanel).getByRole('treeitem', { name: 'QA Node' });

  expect(regularNodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-source',
    'custom'
  );
  expect(reviewNodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-source',
    'custom'
  );
  expect(reviewNodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-mirror',
    'fallback'
  );
  expect(reviewNodeButton.querySelector('svg[data-node-custom-slot="primary"]')).not.toBeNull();
});

it('uses separate custom svgs for reading and review variants', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
    '<svg viewBox="0 0 16 16"><path d="M2 12C6 10 10 6 14 2" fill="none" stroke="#2f855a"/></svg>'
  );
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg,
    '<svg viewBox="0 0 16 16"><path d="M2 4C6 6 10 10 14 14" fill="none" stroke="#2f855a"/></svg>'
  );
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-qa'],
    nodesById: {
      ...state.nodesById,
      'node-qa': createNode({
        id: 'node-qa',
        title: 'QA Node',
        content: '# QA Node',
        reveal: 'Answer'
      })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  const regularNodeButton = within(listPanel).getByRole('treeitem', { name: 'Welcome to Foliole' });
  const reviewNodeButton = within(listPanel).getByRole('treeitem', { name: 'QA Node' });

  expect(regularNodeButton.querySelector('svg[data-node-custom-slot="primary"]')).not.toBeNull();
  expect(reviewNodeButton.querySelector('svg[data-node-custom-slot="secondary"]')).not.toBeNull();
  expect(reviewNodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-mirror',
    'none'
  );
});
