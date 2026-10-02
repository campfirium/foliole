import { beforeAll, expect, it } from 'vitest';

import { preloadTranslationCatalog, translate } from '../../../shared/localization/translations';

import { localizeDatabaseRestoreFailure } from './databaseRestoreNotice';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});

it('explains a known failure in Chinese and retains the original code', () => {
  const result = localizeDatabaseRestoreFailure(
    'The selected backup was not restored. Your current library is unchanged.\nReason: delivery_authorization_ambiguous:Phone',
    (key, params) => translate('zh-Hans', key, params)
  );
  expect(result).toContain('当前资料库保持原状');
  expect(result).toContain('原因：同步授权记录无法明确对应到设备。');
  expect(result).toContain('delivery_authorization_ambiguous:Phone');
});

it('keeps both original and rollback errors without claiming the library is unchanged', () => {
  const result = localizeDatabaseRestoreFailure(
    'The selected backup was not restored, and Foliole could not reopen the current library.\nReason: SQLITE_CORRUPT\nRollback: EACCES',
    (key, params) => translate('en', key, params)
  );
  expect(result).toContain('could not reopen the current library');
  expect(result).toContain('Reason: SQLITE_CORRUPT');
  expect(result).toContain('Rollback error: EACCES');
  expect(result).not.toContain('unchanged');
});
