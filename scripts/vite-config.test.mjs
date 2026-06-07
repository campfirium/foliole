// @vitest-environment node

import { describe, expect, it } from 'vitest';

import companionViteConfig, { unwrapCssCascadeLayersForLegacyWebView } from '../vite.companion.config.ts';
import viteConfig from '../vite.config.ts';

describe('vite config', () => {
  it('uses relative asset paths for desktop file loading', () => {
    expect(viteConfig.base).toBe('./');
  });

  it('keeps Electron dev renderer updates behind explicit preview reload intents', () => {
    expect(viteConfig.server?.hmr).toBe(false);
  });

  it('warms the desktop renderer startup graph before Electron requests the first page', () => {
    expect(viteConfig.server?.warmup?.clientFiles).toEqual(
      expect.arrayContaining([
        './src/main.tsx',
        './src/app/styles.css',
        './src/startupBootstrap.ts',
        './src/shared/platform/bridge.ts',
        './src/app/App.tsx'
      ])
    );
  });

  it('targets Android 9 WebView-compatible syntax for the companion bundle', () => {
    expect(companionViteConfig.build?.target).toBe('chrome64');
    expect(companionViteConfig.build?.cssTarget).toBe('chrome64');
  });

  it('unwraps Tailwind cascade layers for the Android 9 WebView CSS parser', () => {
    const css = '@layer theme{:root{--spacing:.25rem}}@layer utilities{.flex{display:flex}}@layer components;';

    expect(unwrapCssCascadeLayersForLegacyWebView(css)).toBe(':root{--spacing:.25rem}.flex{display:flex}');
  });
});
