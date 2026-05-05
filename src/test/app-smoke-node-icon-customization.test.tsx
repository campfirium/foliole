import { render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, FIXED_TIMESTAMP } from './app-smoke.shared';

function createReadingState() {
  return {
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: FIXED_TIMESTAMP,
    nextAt: FIXED_TIMESTAMP,
    priority: 50,
    readingPosition: 0,
    repetitionCount: 1,
    state: 'active' as const
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

function getTreeItemIcon(name: string) {
  return within(screen.getByRole('complementary', { name: 'Node list panel' }))
    .getByRole('treeitem', { name })
    .querySelector('[data-node-icon="leaf"]');
}

function seedCustomNodeIconSettings() {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingStrokeStyle, 'solid');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingLineWidth, '2.4');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconPendingColor, '#ff6600');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledStrokeStyle, 'dashed');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledLineWidth, '1.8');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledDashLength, '2.5');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledGapLength, '1.5');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledColor, '#0055aa');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedLineWidth, '1.6');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedColor, '#445566');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeEnabled, 'true');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeOpacity, '0.5');
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeWholeRow, 'false');
}

function seedCustomNodeIconState() {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'reading-1',
    nodeOrder: ['reading-1', 'reading-active', 'qa-1', 'qa-active', 'reading-dismissed'],
    nodesById: {
      ...state.nodesById,
      'reading-1': createNode({ id: 'reading-1', title: 'Reading 1', content: '# Reading 1' }),
      'reading-active': createNode({
        id: 'reading-active',
        title: 'Active Reading',
        content: '# Active Reading',
        reading: createReadingState()
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
        reading: {
          ...createReadingState(),
          repetitionCount: 0,
          state: 'dismissed'
        }
      })
    }
  }));
}

function expectCustomizedNodeIcons() {
  expect(getTreeItemIcon('Reading 1')).toHaveAttribute('data-node-icon-pattern', 'normal');
  expect(getTreeItemIcon('Reading 1')).toHaveStyle({ color: 'rgb(255, 102, 0)' });
  expect(getTreeItemIcon('Reading 1')).toHaveStyle({ '--node-icon-stroke-width': '2.4' });
  expect(getTreeItemIcon('QA Node')).toHaveAttribute('data-node-icon-pattern', 'normal');
  expect(getTreeItemIcon('Active Reading')).toHaveStyle({ color: 'rgb(255, 102, 0)' });
  expect(getTreeItemIcon('Active Reading')).toHaveStyle({ '--node-icon-stroke-width': '2.4' });
  expect(getTreeItemIcon('Active QA')).toHaveStyle({ color: 'rgb(0, 85, 170)' });
  expect(getTreeItemIcon('Dismissed Reading')).toHaveStyle({ color: 'rgb(68, 85, 102)', opacity: '0.5' });
  expect(getTreeItemIcon('Dismissed Reading')).toHaveStyle({ '--node-icon-stroke-width': '1.6' });
  expect(
    within(screen.getByRole('complementary', { name: 'Node list panel' }))
      .getByRole('treeitem', { name: 'Dismissed Reading' })
  ).toHaveAttribute('data-node-visibility', 'normal');
}

it('uses configurable state styling while preserving topic and item svg sources', async () => {
  seedCustomNodeIconSettings();
  seedCustomNodeIconState();

  render(<App />);

  await waitFor(expectCustomizedNodeIcons);
}, 15000);
