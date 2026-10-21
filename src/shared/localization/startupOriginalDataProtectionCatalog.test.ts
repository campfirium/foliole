import { expect, it } from 'vitest';

import { ORIGINAL_DATA_PROTECTION_COPY } from '../../../lib/core/localization/startupOriginalDataProtection';

import { EN_SHARED_UI_TRANSLATIONS } from './locales/enSharedUi';
import { ZH_HANS_SHARED_UI_TRANSLATIONS } from './locales/zhHansSharedUi';

// The startup page shows this copy before the renderer catalogs load, so both sources must stay identical.
it('keeps the catalog startup protection copy identical to the pre-renderer copy', () => {
  expect(EN_SHARED_UI_TRANSLATIONS['shared.startup.originalDataProtection']).toBe(ORIGINAL_DATA_PROTECTION_COPY.en);
  expect(ZH_HANS_SHARED_UI_TRANSLATIONS['shared.startup.originalDataProtection']).toBe(ORIGINAL_DATA_PROTECTION_COPY['zh-Hans']);
});
