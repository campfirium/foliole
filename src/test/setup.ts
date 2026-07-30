import '@testing-library/jest-dom/vitest';

import { createElement, type ComponentType, type ReactNode } from 'react';
import { beforeAll, vi } from 'vitest';

import { DisplayScaleProvider } from '../features/settings/context/DisplayScaleProvider';
import { DocumentHeaderMenuSettingsProvider } from '../features/settings/context/DocumentHeaderMenuSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../shared/localization/translations';

beforeAll(async () => {
  await Promise.all([
    preloadTranslationCatalog('en'),
    preloadTranslationCatalog('zh-Hans')
  ]);
});

vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/react')>();

  return {
    ...actual,
    render(ui: Parameters<typeof actual.render>[0], options?: Parameters<typeof actual.render>[1]) {
      const OriginalWrapper = options?.wrapper as ComponentType<{ children: ReactNode }> | undefined;
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(
          LocalizationProvider,
          null,
          createElement(
            DisplayScaleProvider,
            null,
            createElement(
              DocumentHeaderMenuSettingsProvider,
              null,
              OriginalWrapper ? createElement(OriginalWrapper, null, children) : children
            )
          )
        );

      return actual.render(ui, { ...options, wrapper });
    }
  };
});

if (!globalThis.DOMMatrix) {
  globalThis.DOMMatrix = class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
  } as typeof DOMMatrix;
}
