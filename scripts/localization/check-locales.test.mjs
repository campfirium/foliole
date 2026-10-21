import { expect, it } from 'vitest';

import { checkAllLocales, readTranslatedDomain } from './check-locales.mjs';

it('keeps all formal locale catalogs aligned with English', async () => {
  await expect(checkAllLocales()).resolves.toEqual([]);
});

it('reports a missing locale catalog as absent instead of failing the whole check', async () => {
  await expect(readTranslatedDomain('/nonexistent/foliole-locale/domain.json')).resolves.toBeNull();
});
