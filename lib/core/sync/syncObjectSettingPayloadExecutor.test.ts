import { expect, it } from 'vitest';

import { stripLegacyWatchedSources } from './syncObjectSettingPayloadExecutor.js';

it('permanently strips legacy watched sources from incoming import settings', () => {
  expect(JSON.parse(stripLegacyWatchedSources(
    'import_manager_settings', JSON.stringify({ readwiseRootPath: '/reader', sources: [{ id: 'late' }] })
  ))).toEqual({ readwiseRootPath: '/reader' });
});

it('does not rewrite unrelated setting payloads', () => {
  expect(stripLegacyWatchedSources('app_settings', '{"sources":[1]}')).toBe('{"sources":[1]}');
});
