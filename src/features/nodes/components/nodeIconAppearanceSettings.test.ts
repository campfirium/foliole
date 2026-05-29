import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import {
  DEFAULT_NODE_ICON_BASE_APPEARANCE,
  DEFAULT_NODE_ICON_BASE_APPEARANCE_BY_KIND,
  DEFAULT_NODE_ICON_STATE_APPEARANCE,
  getDefaultNodeIconStateAppearanceForKind,
  getNodeIconStateAppearance,
  shouldFadeDismissedRowText
} from './nodeIconAppearanceSettings';

beforeEach(() => {
  window.localStorage.clear();
});

it('reads dismissed text fade by icon kind and keeps legacy row fade compatible', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedItemAppearance,
    JSON.stringify({ fadeEnabled: true, fadeOpacity: 0.25, fadeWholeRow: true })
  );
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedTopicAppearance,
    JSON.stringify({ fadeEnabled: false, fadeWholeRow: false })
  );

  expect(shouldFadeDismissedRowText('review')).toBe(true);
  expect(getNodeIconStateAppearance('dismissed', 'review').fadeTextOpacity).toBe(0.25);
  expect(shouldFadeDismissedRowText('reading')).toBe(false);
});

it('uses the saved navigation icon values as code defaults', () => {
  expect(DEFAULT_NODE_ICON_BASE_APPEARANCE).toMatchObject({
    color: '#444444',
    lineWidth: 0.6,
    scale: 1.15
  });
  expect(DEFAULT_NODE_ICON_BASE_APPEARANCE_BY_KIND.review).toMatchObject({
    color: '#444444',
    lineWidth: 0.6,
    scale: 1.3
  });
  expect(DEFAULT_NODE_ICON_STATE_APPEARANCE.scheduled).toMatchObject({
    color: '#444444',
    innerLineWidth: 0.5,
    innerScale: 0.7,
    lineWidth: 0.6,
    outerLineWidth: 0.6,
    outerScale: 1.1,
    scale: 1.15
  });
  expect(getDefaultNodeIconStateAppearanceForKind('scheduled', 'review')).toMatchObject({
    innerLineWidth: 0.5,
    innerScale: 0.8,
    lineWidth: 0.6,
    outerLineWidth: 0,
    outerScale: 1.3,
    scale: 1.3
  });
  expect(DEFAULT_NODE_ICON_STATE_APPEARANCE.dismissed).toMatchObject({
    fadeEnabled: true,
    fadeOpacity: 0.6,
    fadeTextOpacity: 0.6
  });
});

it('allows zero width for single visible double-line layer', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledItemAppearance,
    JSON.stringify({ effect: 'double-line', innerLineWidth: 0, outerLineWidth: 1.4 })
  );

  expect(getNodeIconStateAppearance('scheduled', 'review')).toMatchObject({
    effect: 'double-line',
    innerLineWidth: 0,
    outerLineWidth: 1.4
  });
});

it('inherits base scale for state appearance until overridden', () => {
  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimaryAppearance,
    JSON.stringify({ scale: 1.35 })
  );

  expect(getNodeIconStateAppearance('pending', 'reading').scale).toBe(1.35);

  window.localStorage.setItem(
    APP_SETTINGS_STORAGE_KEYS.nodeIconPendingTopicAppearance,
    JSON.stringify({ scale: 0.85 })
  );

  expect(getNodeIconStateAppearance('pending', 'reading').scale).toBe(0.85);
});
