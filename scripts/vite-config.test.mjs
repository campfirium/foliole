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
});
