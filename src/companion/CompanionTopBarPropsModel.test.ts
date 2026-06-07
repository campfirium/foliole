import { beforeAll, describe, expect, it, vi } from 'vitest';

import { preloadTranslationCatalog, translate } from '../shared/localization/translations';

import { resolveCompanionTopBarProps } from './CompanionTopBarPropsModel';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

function buildTopBarProps(settingsPage = 'list') {
  return resolveCompanionTopBarProps(
    (key, params) => translate('en', key, params),
    { activeAction: 'more' } as never,
    settingsPage as never,
    false,
    false,
    { kind: 'root' } as never,
    'dateLastOpened',
    'desc',
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    undefined,
    false,
    undefined,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn()
  );
}

describe('CompanionTopBarPropsModel', () => {
  it('keeps the settings landing page anchored by a visible title', () => {
    expect(buildTopBarProps()).toMatchObject({ title: 'Settings' });
  });

  it('keeps settings detail pages on their existing back chrome', () => {
    expect(buildTopBarProps('sync')).toMatchObject({ backLabel: 'Settings', title: 'Device sync' });
    expect(buildTopBarProps('device')).toMatchObject({ backLabel: 'Settings', title: 'Device' });
    expect(buildTopBarProps('appearance')).toMatchObject({ backLabel: 'Settings', title: 'Appearance' });
    expect(buildTopBarProps('debug')).toMatchObject({ backLabel: 'Settings', title: 'Debug' });
  });
});
