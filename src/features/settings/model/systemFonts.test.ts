import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../shared/platform/runtimeSystemFonts', () => ({
  listRuntimeSystemFonts: vi.fn()
}));

import { listRuntimeSystemFonts } from '../../../shared/platform/runtimeSystemFonts';

import { listAvailableSystemFonts } from './systemFonts';

const mockedListRuntimeSystemFonts = vi.mocked(listRuntimeSystemFonts);

beforeEach(() => {
  mockedListRuntimeSystemFonts.mockReset();
});

it('sanitizes runtime font entries before exposing options in settings', async () => {
  mockedListRuntimeSystemFonts.mockResolvedValue({
    fonts: [
      'Verdana (TrueType)',
      'Verdana Bold (TrueType)',
      '@SimSun (TrueType)',
      'UD Digi Kyokasho N & UD Digi Kyokasho NP (TrueType)',
      'XHei-Believe',
      'XHei-Believe-Bold',
      'Cascadia Mono'
    ],
    monospaceFonts: ['Cascadia Mono (TrueType)']
  });

  const catalog = await listAvailableSystemFonts();

  expect(catalog.fonts).toEqual(['Cascadia Mono', 'SimSun', 'UD Digi Kyokasho N', 'UD Digi Kyokasho NP', 'Verdana', 'XHei-Believe']);
  expect(catalog.monospaceFonts).toEqual(['Cascadia Mono']);
});
