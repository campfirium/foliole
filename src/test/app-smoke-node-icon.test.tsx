import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

it('renders folder nodes with folder icons and keeps topics on topic icons', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-topic',
    nodeOrder: ['node-folder', 'node-topic'],
    nodesById: {
      ...state.nodesById,
      'node-folder': createNode({
        id: 'node-folder',
        kind: 'folder',
        title: 'Folder Node',
        content: ''
      }),
      'node-topic': createNode({
        id: 'node-topic',
        kind: 'topic',
        title: 'Topic Node',
        content: '# Topic Node'
      })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  const folderNodeButton = within(listPanel).getByRole('treeitem', { name: 'Folder Node' });
  const topicNodeButton = within(listPanel).getByRole('treeitem', { name: 'Topic Node' });

  expect(folderNodeButton.querySelector('[data-node-icon="folder"]')).not.toBeNull();
  expect(folderNodeButton.querySelector('[data-node-icon="leaf"]')).toBeNull();
  expect(topicNodeButton.querySelector('[data-node-icon="leaf"]')).not.toBeNull();
  expect(topicNodeButton.querySelector('[data-node-icon="folder"]')).toBeNull();
});

it('uses a single custom svg with review mirror fallback', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
    '<svg viewBox="0 0 16 16"><path d="M3 12C7 10 9 6 13 3" fill="none" stroke="#2f855a"/></svg>'
  );
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-reading',
    nodeOrder: ['node-reading', 'node-qa'],
    nodesById: {
      ...state.nodesById,
      'node-reading': createNode({
        id: 'node-reading',
        kind: 'item',
        title: 'Reading Node',
        content: '# Reading Node'
      }),
      'node-qa': createNode({
        id: 'node-qa',
        kind: 'item',
        title: 'QA Node',
        content: '# QA Node',
        reveal: 'Answer'
      })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Node list panel' });
  const regularNodeButton = within(listPanel).getByRole('treeitem', { name: 'Reading Node' });
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

it('supports horizontal flip as the review variant mode', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
    '<svg viewBox="0 0 16 16"><path d="M2 12C6 10 10 6 14 2" fill="none" stroke="#2f855a"/></svg>'
  );
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconReviewVariantMode, 'flip-x');
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-reading',
    nodeOrder: ['node-reading', 'node-qa'],
    nodesById: {
      ...state.nodesById,
      'node-reading': createNode({
        id: 'node-reading',
        kind: 'item',
        title: 'Reading Node',
        content: '# Reading Node'
      }),
      'node-qa': createNode({
        id: 'node-qa',
        kind: 'item',
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
