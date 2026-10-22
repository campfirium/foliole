import '@testing-library/jest-dom/vitest';

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createElement, type ComponentType, type ReactNode } from 'react';
import { afterAll, beforeAll, vi } from 'vitest';

import { DisplayScaleProvider } from '../features/settings/context/DisplayScaleProvider';
import { DocumentHeaderMenuSettingsProvider } from '../features/settings/context/DocumentHeaderMenuSettingsProvider';
import { LocalizationProvider } from '../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../shared/localization/translations';

// Desktop code resolves device identity from this root; without one, macOS code under
// test would open the installed app's group container and wait on a consent prompt.
const ownedTestStateRoot = process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT?.trim()
  ? null : mkdtempSync(path.join(os.tmpdir(), 'foliole-vitest-state-'));
if (ownedTestStateRoot) process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT = ownedTestStateRoot;

afterAll(() => {
  if (!ownedTestStateRoot) return;
  if (process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT === ownedTestStateRoot) {
    delete process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT;
  }
  rmSync(ownedTestStateRoot, { force: true, recursive: true });
});

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
