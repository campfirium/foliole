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
    { kind: 'root' } as never,
    'dateLastOpened',
    'desc',
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
  it('places the settings title in the shared toolbar', () => {
    expect(buildTopBarProps()).toMatchObject({ title: 'Settings' });
  });

  it('lets the settings home return to browsing', () => {
    expect(buildTopBarProps()).toMatchObject({ backLabel: 'Back', onBack: expect.any(Function) });
  });

  it('lets every settings detail return to its parent', () => {
    for (const page of ['clozeGuard', 'learning', 'foregroundTime', 'reviewStatistics', 'backup', 'appearance', 'debug', 'sync', 'device', 'tabs']) {
      expect(buildTopBarProps(page)).toMatchObject({ backLabel: 'Settings', onBack: expect.any(Function) });
    }
    expect(buildTopBarProps('learning')).toMatchObject({ title: 'Review' });
    expect(buildTopBarProps('clozeGuard')).toMatchObject({ title: 'Cloze guard' });
    expect(buildTopBarProps('foregroundTime')).toMatchObject({ title: 'Foreground time' });
  });

  it('keeps settings detail pages on their existing back chrome', () => {
    expect(buildTopBarProps('sync')).toMatchObject({ backLabel: 'Settings', title: 'Sync' });
    expect(buildTopBarProps('syncGroup')).toMatchObject({ backLabel: 'Sync', title: 'Sync Group' });
    expect(buildTopBarProps('device')).toMatchObject({ backLabel: 'Settings', title: 'Device' });
    expect(buildTopBarProps('appearance')).toMatchObject({ backLabel: 'Settings', title: 'Appearance' });
    expect(buildTopBarProps('debug')).toMatchObject({ backLabel: 'Settings', title: 'Debug' });
  });

  it('uses compact chrome for the review surface actions', () => {
    const topBarProps = resolveCompanionTopBarProps(
      (key, params) => translate('en', key, params),
      { activeAction: 'review' } as never,
      'list' as never,
      false,
      { kind: 'root' } as never,
      'dateLastOpened',
      'desc',
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

    expect(topBarProps).toMatchObject({ density: 'compact' });
  });

  it('shows the selected folder name on the browse surface', () => {
    const surface = { activeAction: 'recent', browsedFolder: { title: 'Inbox' } } as never;
    const args = [
      (key: string, params?: never) => translate('en', key as never, params), surface,
      'list', false, { kind: 'root' }, 'dateLastOpened', 'desc',
      vi.fn(), vi.fn(), vi.fn(), vi.fn(), undefined,
      false, undefined, vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()
    ] as Parameters<typeof resolveCompanionTopBarProps>;

    expect(resolveCompanionTopBarProps(...args)).toMatchObject({ title: 'Inbox' });
  });
});
