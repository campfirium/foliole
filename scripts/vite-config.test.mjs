// @vitest-environment node

import { describe, expect, it } from 'vitest';

import companionViteConfig, { unwrapCssCascadeLayersForLegacyWebView } from '../vite.companion.config.ts';
import { DESKTOP_RENDERER_WARMUP_FILES } from '../vite.shared.ts';
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
        './src/app/App.tsx',
        './src/app/AppRuntime.tsx'
      ])
    );
  });

  it('warms the measured desktop workspace startup hotspots', () => {
    expect(DESKTOP_RENDERER_WARMUP_FILES).toEqual(
      expect.arrayContaining([
        './src/app/hooks/useAppController.ts',
        './src/app/hooks/appControllerState.ts',
        './src/app/hooks/appControllerLayoutProps.ts',
        './src/app/components/WorkspaceLayout.tsx',
        './src/app/components/WorkspaceLayoutGrid.tsx',
        './src/store/workspaceStoreHydration.ts',
        './src/store/workspaceRendererBoundaryKeepNodeIds.ts',
        './src/shared/localization/locales/en.ts',
        './src/shared/localization/locales/zhHans.ts'
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
