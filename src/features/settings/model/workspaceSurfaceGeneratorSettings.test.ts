import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  addWorkspaceSurfaceFavorite,
  getWorkspaceSurfaceFavorites,
  getWorkspaceSurfaceRandomHistory,
  pushWorkspaceSurfaceRandomHistoryEntry,
  removeWorkspaceSurfaceFavorite
} from './workspaceSurfaceGeneratorSettings';

const A = ['#8c7b68', '#ddd1c1', '#ebe1d3', '#faf6f0', '#e7dbc9'];
const B = ['#657f79', '#b8d0ca', '#d9ebe7', '#f8fbfa', '#d0e3de'];

beforeEach(() => {
  window.localStorage.clear();
});

it('stores unique favorites and moves duplicates to the front', () => {
  expect(addWorkspaceSurfaceFavorite(A)).toEqual([A]);
  expect(addWorkspaceSurfaceFavorite(B)).toEqual([B, A]);
  expect(addWorkspaceSurfaceFavorite(A)).toEqual([A, B]);
  expect(getWorkspaceSurfaceFavorites()).toEqual([A, B]);
});

it('removes favorites by palette signature', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceFavorites, JSON.stringify([A, B]));

  expect(removeWorkspaceSurfaceFavorite(A)).toEqual([B]);
  expect(getWorkspaceSurfaceFavorites()).toEqual([B]);
});

it('keeps only the eight most recent history entries', () => {
  const entries = Array.from({ length: 9 }, (_, index) => (
    [`#00000${index}`, `#11111${index}`, `#22222${index}`, `#33333${index}`, `#44444${index}`]
  ));

  entries.forEach((palette) => {
    pushWorkspaceSurfaceRandomHistoryEntry(palette);
  });

  const history = getWorkspaceSurfaceRandomHistory();
  expect(history).toHaveLength(8);
  expect(history[0]).toEqual(entries[8]);
  expect(history.at(-1)).toEqual(entries[1]);
});
