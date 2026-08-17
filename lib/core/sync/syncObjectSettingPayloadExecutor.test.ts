import { expect, it } from 'vitest';

import { stripLegacyImportPaths } from './syncObjectSettingPayloadExecutor.js';

it('permanently strips legacy device paths from incoming workspace import settings', () => {
  expect(JSON.parse(stripLegacyImportPaths(
    'import_manager_settings', JSON.stringify({
      readwiseReaderConfig: { enabled: true }, readwiseRootPath: '/reader', readwiseSources: [], sources: [{ id: 'late' }]
    })
  ))).toEqual({});
});

it('does not rewrite unrelated setting payloads', () => {
  expect(stripLegacyImportPaths('app_settings', '{"sources":[1]}')).toBe('{"sources":[1]}');
});
