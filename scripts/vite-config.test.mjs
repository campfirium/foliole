// @vitest-environment node

import { describe, expect, it } from 'vitest';

import viteConfig from '../vite.config.ts';

describe('vite config', () => {
  it('uses relative asset paths for desktop file loading', () => {
    expect(viteConfig.base).toBe('./');
  });

  it('does not reload the dev renderer when Electron rewrites its runtime startup html', () => {
    expect(viteConfig.server?.watch?.ignored).toContain('**/.electron-user-data/runtime-renderer-index.html');
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
});
