import { describe, expect, it } from 'vitest';

import { selectPlatformReleaseNoteSections } from './updateReleaseNotes';

const WINDOWS = { architecture: 'x64', platform: 'windows' } as const;
const MACOS = { architecture: 'arm64', platform: 'macos' } as const;
const manifest = {
  schemaVersion: 1,
  releases: [
    { version: '0.8.2', platforms: ['macos'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.8.2' },
    { version: '0.8.1', platforms: ['windows'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.8.1' }
  ]
};
const catalog = {
  '0.8.2': { notes: ['Improved', 'A final shared change.'], platformNotes: { macos: ['Fixed', 'A macOS fix.'] } },
  '0.8.1': { notes: ['New', 'A shared change.'], platformNotes: { windows: ['Fixed', 'A Windows fix.'] } }
};

describe('cross-version platform release notes', () => {
  it('includes shared changes from a skipped product version when they enter the target binary', () => {
    const sections = selectPlatformReleaseNoteSections(manifest, catalog, '0.8.0', '0.8.2', MACOS);
    expect(sections.map(({ release }) => release.version)).toEqual(['0.8.2', '0.8.1']);
    expect(sections[1]?.releaseNotes.notes).toEqual(['New', 'A shared change.']);
    expect(sections.flatMap(({ releaseNotes }) => releaseNotes.notes)).not.toContain('A Windows fix.');
  });

  it('keeps platform-limited changes for their declared platform', () => {
    const sections = selectPlatformReleaseNoteSections(manifest, catalog, '0.8.0', '0.8.2', WINDOWS);
    expect(sections.flatMap(({ releaseNotes }) => releaseNotes.notes)).toContain('A Windows fix.');
    expect(sections.flatMap(({ releaseNotes }) => releaseNotes.notes)).not.toContain('A macOS fix.');
  });
});
