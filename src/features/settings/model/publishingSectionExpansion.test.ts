import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  DEFAULT_PUBLISHING_SECTION_EXPANSION,
  loadPublishingSectionExpansion,
  savePublishingSectionExpansion
} from './publishingSectionExpansion';

beforeEach(() => window.localStorage.clear());

it('defaults every publishing section to collapsed', () => {
  expect(loadPublishingSectionExpansion()).toEqual(DEFAULT_PUBLISHING_SECTION_EXPANSION);
});

it('restores independent expanded sections from persisted settings', () => {
  savePublishingSectionExpansion({ discourse: false, foliole: true, wordpress: true });

  expect(loadPublishingSectionExpansion()).toEqual({ discourse: false, foliole: true, wordpress: true });
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.publishingExpandedSections)).toContain('"foliole":true');
});

it('falls back safely when persisted settings are unreadable', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.publishingExpandedSections, '{bad json');
  expect(loadPublishingSectionExpansion()).toEqual(DEFAULT_PUBLISHING_SECTION_EXPANSION);
});
