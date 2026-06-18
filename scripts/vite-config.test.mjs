// @vitest-environment node

import { describe, expect, it } from 'vitest';

import companionViteConfig, { unwrapCssCascadeLayersForLegacyWebView } from '../vite.companion.config.ts';
import demoViteConfig, { demoManifestPlugin } from '../vite.demo.config.ts';
import viteConfig from '../vite.config.ts';
import { injectDefaultStartupSkeletonHtml } from '../vite.shared.ts';

const normalizePath = (value) => String(value).replaceAll('\\', '/');

describe('vite config', () => {
  it('uses relative asset paths for desktop file loading', () => {
    expect(viteConfig.base).toBe('./');
  });

  it('does not reload the dev renderer when Electron rewrites its runtime startup html', () => {
    expect(viteConfig.server?.watch?.ignored).toContain('**/.tmp/electron-user-data*/runtime-renderer-index.html');
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

  it('injects the default startup skeleton tokens before packaging desktop html', () => {
    const html =
      '<html lang="en"><head><style>:root{/*STARTUP_INJECTED_CSS*/}</style></head><body><section id="boot-skeleton" class="startup-shell"></section><div id="root"></div></body></html>';
    const transformed = injectDefaultStartupSkeletonHtml(html);

    expect(transformed).toContain('id="boot-skeleton"');
    expect(transformed).toContain('data-base-color="light"');
    expect(transformed).not.toContain('<html lang="en" style=');
    expect(transformed).toContain('--startup-region-main-rail-bg: #b9b1a7;');
    expect(transformed).toContain('--startup-region-main-folder-bg: #e7e3dd;');
    expect(transformed).toContain('--startup-region-main-topic-bg: #f3eee8;');
    expect(transformed).toContain('--startup-region-main-document-bg: #ffffff;');
    expect(transformed).toContain('--startup-region-main-sidebar-bg: #fbf9f7;');
    expect(transformed).not.toContain('STARTUP_INJECTED_CSS');
  });

  it('targets Android 9 WebView-compatible syntax for the companion bundle', () => {
    expect(companionViteConfig.build?.target).toBe('chrome64');
    expect(companionViteConfig.build?.cssTarget).toBe('chrome64');
  });

  it('keeps non-desktop targets free from desktop renderer warmup files', () => {
    expect(companionViteConfig.server?.warmup).toBeUndefined();
    expect(demoViteConfig.server?.warmup).toBeUndefined();
  });

  it('builds Demo from its Web host root into its static output directory', () => {
    expect(normalizePath(demoViteConfig.root)).toMatch(/src\/demo$/);
    expect(normalizePath(demoViteConfig.build?.outDir)).toMatch(/dist\/demo$/);
    expect(demoViteConfig.build?.emptyOutDir).toBe(true);
  });

  it('emits the Demo manifest from public bundle asset names', () => {
    const emitted = [];
    const plugin = demoManifestPlugin();

    plugin.generateBundle.call(
      { emitFile: (asset) => emitted.push(asset) },
      {},
      {
        'assets/index-abc.js': { type: 'chunk', fileName: 'assets/index-abc.js' },
        'assets/index-def.css': { type: 'asset', fileName: 'assets/index-def.css', source: '' },
        'assets/logo.png': { type: 'asset', fileName: 'assets/logo.png', source: '' }
      }
    );

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ fileName: 'demo-manifest.json', type: 'asset' });
    const manifest = JSON.parse(emitted[0].source);
    expect(manifest.runtime).toEqual({
      entry: 'index.html',
      assets: [
        { path: 'assets/index-abc.js', type: 'script' },
        { path: 'assets/index-def.css', type: 'style' }
      ]
    });
    expect(manifest.contractVersion).toBe(3);
    expect(manifest.localePublishPacks[0].topics[0]).toMatchObject({
      slug: 'focused-reading-review',
      locale: 'en',
      canonicalPath: '/en/demo/focused-reading-review/',
      alternates: expect.arrayContaining([
        { locale: 'zh-hans', hreflang: 'zh-Hans', path: '/zh-hans/demo/focused-reading-review/' }
      ])
    });
  });

  it('unwraps Tailwind cascade layers for the Android 9 WebView CSS parser', () => {
    const css = '@layer theme{:root{--spacing:.25rem}}@layer utilities{.flex{display:flex}}@layer components;';

    expect(unwrapCssCascadeLayersForLegacyWebView(css)).toBe(':root{--spacing:.25rem}.flex{display:flex}');
  });
});
