import { beforeAll, expect, it } from 'vitest';

import { preloadTranslationCatalog, translate } from '../shared/localization/translations';

import { resolveLastSyncRow } from './companionSyncStatusRows';

beforeAll(() => preloadTranslationCatalog('en'));

it('describes queued manual sync without claiming that changes are being pulled', () => {
  const t = translate.bind(null, 'en');
  const row = resolveLastSyncRow({ lastSyncedAt: null, status: 'syncing', syncEvents: [],
    syncProgress: { phase: 'waiting', completed: 0, total: null }, t });
  expect(row.label).toBe('Waiting for the other device to finish syncing');
  expect(row.value).toBe('Waiting');
  expect(row.detail).not.toBe(t('companion.sync.pullingChanges'));
});
