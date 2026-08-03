// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { assertReleaseBodyPlatformScope, formatReleasePlatformHeading } from './release-body-contract.mjs';

const IDENTITY = {
  intent: { selectedPlatforms: ['windows'] },
  registry: { platforms: [{ id: 'macos', displayName: 'macOS' }, { id: 'windows', displayName: 'Windows' }] }
};

describe('release body platform scope', () => {
  it('formats and accepts the frozen release scope at the top of the single body', () => {
    expect(formatReleasePlatformHeading(IDENTITY)).toBe('> Platforms: Windows');
    expect(assertReleaseBodyPlatformScope('> Platforms: Windows\n\n### Fixed', IDENTITY)).toContain('### Fixed');
  });

  it('rejects a missing, reordered, or expanded scope declaration', () => {
    expect(() => assertReleaseBodyPlatformScope('### Fixed', IDENTITY)).toThrow('must begin');
    expect(() => assertReleaseBodyPlatformScope('> Platforms: macOS, Windows', IDENTITY)).toThrow('must begin');
  });
});
