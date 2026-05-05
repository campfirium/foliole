// @vitest-environment node

import { describe, expect, it } from 'vitest';

import viteConfig from '../vite.config.ts';

describe('vite config', () => {
  it('uses relative asset paths for desktop file loading', () => {
    expect(viteConfig.base).toBe('./');
  });
});
