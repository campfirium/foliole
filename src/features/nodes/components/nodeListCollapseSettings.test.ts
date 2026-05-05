import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  loadCollapsedTrashNodeIds,
  loadManualCollapsedNoteNodeIds,
  loadManualExpandedNoteNodeIds,
  saveCollapsedTrashNodeIds,
  saveManualCollapsedNoteNodeIds,
  saveManualExpandedNoteNodeIds
} from './nodeListCollapseSettings';

beforeEach(() => {
  window.localStorage.clear();
});

it('persists and reloads node list collapse overrides', () => {
  saveManualCollapsedNoteNodeIds(['node-1', 'node-2']);
  saveManualExpandedNoteNodeIds(['node-3']);
  saveCollapsedTrashNodeIds(['trash-1']);

  expect(loadManualCollapsedNoteNodeIds()).toEqual(['node-1', 'node-2']);
  expect(loadManualExpandedNoteNodeIds()).toEqual(['node-3']);
  expect(loadCollapsedTrashNodeIds()).toEqual(['trash-1']);
});

it('removes stored overrides when a list becomes empty', () => {
  saveManualCollapsedNoteNodeIds(['node-1']);
  saveManualCollapsedNoteNodeIds([]);

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.nodeListManualCollapsed)).toBeNull();
  expect(loadManualCollapsedNoteNodeIds()).toEqual([]);
});
