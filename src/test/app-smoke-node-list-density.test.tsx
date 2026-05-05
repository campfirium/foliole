import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';

function getNodeListTree() {
  return within(screen.getByRole('complementary', { name: 'Topic list panel' })).getByRole('tree');
}

function getTreeItem(name: string) {
  return within(screen.getByRole('complementary', { name: 'Topic list panel' })).getByRole('treeitem', { name });
}

beforeEach(() => {
  window.localStorage.removeItem(APP_SETTINGS_STORAGE_KEYS.nodeListRowSpacing);
});

it('uses 6px node list row spacing by default', () => {
  render(<App />);

  expect(getNodeListTree()).toHaveAttribute('data-node-list-row-spacing', '6');
  expect(getNodeListTree()).toHaveAttribute('data-node-list-row-gap', '4');
  expect(getTreeItem('Welcome to Foliole')).toHaveAttribute('data-node-row-spacing', '6');
  expect(getTreeItem('Welcome to Foliole')).toHaveStyle({ paddingTop: '6px', paddingBottom: '6px' });
});

it('applies the stored node list row spacing override', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.nodeListRowSpacing, '8');

  render(<App />);

  expect(getNodeListTree()).toHaveAttribute('data-node-list-row-spacing', '8');
  expect(getNodeListTree()).toHaveAttribute('data-node-list-row-gap', '6');
  expect(getTreeItem('Welcome to Foliole')).toHaveAttribute('data-node-row-spacing', '8');
  expect(getTreeItem('Welcome to Foliole')).toHaveStyle({ paddingTop: '8px', paddingBottom: '8px' });
});
