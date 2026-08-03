import { describe, expect, it } from 'vitest';

import { releaseMatchesTarget, resolveRuntimeUpdateTarget } from './updateTarget';

describe('update target', () => {
  it('resolves supported desktop hosts to their release targets', () => {
    expect(resolveRuntimeUpdateTarget('MacIntel', 'Electron')).toEqual({
      architecture: 'arm64',
      platform: 'macos'
    });
    expect(resolveRuntimeUpdateTarget('Win32', 'Electron')).toEqual({
      architecture: 'x64',
      platform: 'windows'
    });
    expect(resolveRuntimeUpdateTarget('Linux x86_64', 'Electron')).toEqual({
      architecture: 'x64',
      platform: 'linux'
    });
  });

  it('matches platform-only releases and filters architecture-specific releases', () => {
    const target = { architecture: 'arm64', platform: 'macos' } as const;

    expect(releaseMatchesTarget({ platforms: ['macos'] }, target)).toBe(true);
    expect(releaseMatchesTarget({ architectures: ['arm64'], platforms: ['macos'] }, target)).toBe(true);
    expect(releaseMatchesTarget({ architectures: ['x64'], platforms: ['macos'] }, target)).toBe(false);
    expect(releaseMatchesTarget({ architectures: ['arm64'], platforms: ['windows'] }, target)).toBe(false);
    expect(releaseMatchesTarget({ architectures: ['x64'], platforms: ['linux'] }, {
      architecture: 'x64', platform: 'linux'
    })).toBe(true);
  });
});
