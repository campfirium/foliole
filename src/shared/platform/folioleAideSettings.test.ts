import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  getFolioleAideFollowCurrentMaterial,
  getFolioleAideEnabled,
  setFolioleAideFollowCurrentMaterial,
  setFolioleAideEnabled,
  subscribeFolioleAideEnabled
} from './folioleAideSettings';

beforeEach(() => {
  window.localStorage.clear();
});

it('defaults material following on and persists explicit changes', () => {
  expect(getFolioleAideFollowCurrentMaterial()).toBe(true);

  setFolioleAideFollowCurrentMaterial(false);
  expect(getFolioleAideFollowCurrentMaterial()).toBe(false);
  expect(
    window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.folioleAideFollowCurrentMaterial)
  ).toBe('false');
});

it('keeps Foliole Aide disabled until the user explicitly enables it', () => {
  expect(getFolioleAideEnabled()).toBe(false);

  setFolioleAideEnabled(true);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled)).toBe('true');
  expect(getFolioleAideEnabled()).toBe(true);

  setFolioleAideEnabled(false);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled)).toBe('false');
  expect(getFolioleAideEnabled()).toBe(false);
});

it('notifies subscribers when Foliole Aide enablement changes', () => {
  const listener = vi.fn();
  const unsubscribe = subscribeFolioleAideEnabled(listener);

  setFolioleAideEnabled(true);
  setFolioleAideEnabled(false);
  unsubscribe();
  setFolioleAideEnabled(true);

  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenNthCalledWith(1, true);
  expect(listener).toHaveBeenNthCalledWith(2, false);
});
