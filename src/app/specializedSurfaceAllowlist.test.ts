import { describe, expect, it } from 'vitest';

import {
  ALLOWED_SPECIALIZED_SURFACE_FILES,
  collectSpecializedSurfaceFiles
} from '../../scripts/check-specialized-surface-usage.mjs';

describe('specialized surface allowlist', () => {
  it('keeps remaining generic bg surface usage explicitly classified', () => {
    expect(collectSpecializedSurfaceFiles()).toEqual(ALLOWED_SPECIALIZED_SURFACE_FILES);
  });
});
