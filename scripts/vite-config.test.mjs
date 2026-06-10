// @vitest-environment node

import { describe, expect, it } from 'vitest';

import companionViteConfig, { unwrapCssCascadeLayersForLegacyWebView } from '../vite.companion.config.ts';
import guidesViteConfig from '../vite.guides.config.ts';
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

  it('keeps non-desktop targets free from desktop renderer warmup files', () => {
    expect(companionViteConfig.server?.warmup).toBeUndefined();
    expect(guidesViteConfig.server?.warmup).toBeUndefined();
  });

  it('builds Web Guides from an isolated root into its static output directory', () => {
    expect(String(guidesViteConfig.root)).toMatch(/src\/web-guides$/);
    expect(String(guidesViteConfig.build?.outDir)).toMatch(/dist-guides$/);
    expect(guidesViteConfig.build?.emptyOutDir).toBe(true);
  });

  it('unwraps Tailwind cascade layers for the Android 9 WebView CSS parser', () => {
    const css = '@layer theme{:root{--spacing:.25rem}}@layer utilities{.flex{display:flex}}@layer components;';

    expect(unwrapCssCascadeLayersForLegacyWebView(css)).toBe(':root{--spacing:.25rem}.flex{display:flex}');
  });
});
