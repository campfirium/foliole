import { expect, it } from 'vitest';

import { checkAllLocales } from './check-locales.mjs';

it('keeps all formal locale catalogs aligned with English', async () => {
  await expect(checkAllLocales()).resolves.toEqual([]);
});
