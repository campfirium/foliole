import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { useWorkspaceStore } from '../store/workspaceStore';
import type { WorkspaceState } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

function createReadingState(repetitionCount: number, state: 'active' | 'dismissed' = 'active') {
  return {
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: FIXED_TIMESTAMP,
    nextAt: FIXED_TIMESTAMP,
    priority: 50,
    readingPosition: 0,
    repetitionCount,
    state
  };
}

function createHandledReviewState() {
  return {
    due: FIXED_TIMESTAMP,
    lastReviewAt: FIXED_TIMESTAMP,
    state: 2 as const,
    stability: 1,
    difficulty: 1,
    elapsedDays: 1,
    scheduledDays: 1,
    reps: 1,
    lapses: 0
  };
}

function renderNodeIconApp(statePatch: (state: WorkspaceState) => Partial<WorkspaceState>) {
  useWorkspaceStore.setState(statePatch);
  render(<App />);
  return screen.getByRole('complementary', { name: 'Node list panel' });
}

function seedIconStateNodes(state: WorkspaceState): Partial<WorkspaceState> {
  return {
    activeNodeId: 'reading-1',
    nodeOrder: ['reading-1', 'reading-active', 'qa-1', 'qa-active', 'reading-dismissed'],
    nodesById: {
      ...state.nodesById,
      'reading-1': createNode({ id: 'reading-1', title: 'Reading 1', content: '# Reading 1' }),
      'reading-active': createNode({
        id: 'reading-active',
        title: 'Active Reading',
        content: '# Active Reading',
        reading: createReadingState(1)
      }),
      'qa-1': createNode({
        id: 'qa-1',
        title: 'QA Node',
        content: '# QA Node',
        reveal: 'Answer'
      }),
      'qa-active': createNode({
        id: 'qa-active',
        title: 'Active QA',
        content: '# Active QA',
        reveal: 'Answer',
        review: createHandledReviewState()
      }),
      'reading-dismissed': createNode({
        id: 'reading-dismissed',
        title: 'Dismissed Reading',
        content: '# Dismissed Reading',
        reading: createReadingState(0, 'dismissed')
      })
    }
  };
}

function getTreeItemIcon(listPanel: HTMLElement, name: string) {
  return within(listPanel)
    .getByRole('treeitem', { name })
    .querySelector('[data-node-icon="leaf"]');
}

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
  ).toBe('pending');
});

it('maps node list icons to pending, scheduled, and dismissed states', () => {
  const listPanel = renderNodeIconApp((state) => seedIconStateNodes(state));
  const pendingReadingRow = within(listPanel).getByRole('treeitem', { name: 'Reading 1' });
  const scheduledReadingRow = within(listPanel).getByRole('treeitem', { name: 'Active Reading' });
  const pendingReviewRow = within(listPanel).getByRole('treeitem', { name: 'QA Node' });
  const dismissedReadingRow = within(listPanel).getByRole('treeitem', { name: 'Dismissed Reading' });

  expect(getTreeItemIcon(listPanel, 'Reading 1')).toHaveAttribute('data-node-icon-state', 'pending');
  expect(getTreeItemIcon(listPanel, 'Reading 1')).toHaveAttribute('data-node-icon-pattern', 'dash');
  expect(pendingReadingRow).toHaveAttribute('data-node-visibility', 'normal');
  expect(getTreeItemIcon(listPanel, 'Active Reading')).toHaveAttribute('data-node-icon-state', 'scheduled');
  expect(getTreeItemIcon(listPanel, 'Active Reading')).toHaveAttribute('data-node-icon-pattern', 'normal');
  expect(scheduledReadingRow).toHaveAttribute('data-node-visibility', 'normal');
  expect(getTreeItemIcon(listPanel, 'QA Node')).toHaveAttribute('data-node-icon-state', 'pending');
  expect(pendingReviewRow).toHaveAttribute('data-node-visibility', 'normal');
  expect(getTreeItemIcon(listPanel, 'Active QA')).toHaveAttribute('data-node-icon-state', 'scheduled');
  expect(getTreeItemIcon(listPanel, 'Active QA')).toHaveAttribute('data-node-icon-kind', 'review');
  expect(getTreeItemIcon(listPanel, 'Active QA')).toHaveAttribute('data-node-icon-pattern', 'normal');
  expect(getTreeItemIcon(listPanel, 'Dismissed Reading')).toHaveAttribute('data-node-icon-state', 'dismissed');
  expect(getTreeItemIcon(listPanel, 'Dismissed Reading')).toHaveAttribute('data-node-icon-pattern', 'normal');
  expect(dismissedReadingRow).toHaveAttribute('data-node-visibility', 'muted');
  expect(dismissedReadingRow.className).toContain('opacity-35');
});

it('treats later-handled reading nodes as scheduled instead of pending', () => {
  const listPanel = renderNodeIconApp((state) => ({
    activeNodeId: 'reading-later',
    nodeOrder: ['reading-later'],
    nodesById: {
      ...state.nodesById,
      'reading-later': createNode({
        id: 'reading-later',
        title: 'Later Handled Reading',
        content: '# Later Handled Reading',
        reading: createReadingState(1)
      })
    }
  }));
  const nodeButton = within(listPanel).getByRole('treeitem', { name: 'Later Handled Reading' });

  expect(nodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-state',
    'scheduled'
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
    'flip-y'
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
  expect(reviewNodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-pattern',
    'dash'
  );
});

it('supports horizontal flip as the review variant mode', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
    '<svg viewBox="0 0 16 16"><path d="M2 12C6 10 10 6 14 2" fill="none" stroke="#2f855a"/></svg>'
  );
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconReviewVariantMode, 'flip-x');
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
  const reviewNodeButton = within(listPanel).getByRole('treeitem', { name: 'QA Node' });

  expect(reviewNodeButton.querySelector('svg[data-node-custom-slot="primary"]')).not.toBeNull();
  expect(reviewNodeButton.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-mirror',
    'flip-x'
  );
});
