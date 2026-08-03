import { expect, it } from 'vitest';

import { normalizeUpdateManifest, selectLatestPlatformRelease } from './updateCheck';

it('selects a newer trusted Linux x64 release without changing other platform scopes', () => {
  const manifest = normalizeUpdateManifest({
    schemaVersion: 1,
    releases: [
      { architectures: ['x64'], platforms: ['linux'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.8.0', version: '0.8.0' },
      { architectures: ['x64'], platforms: ['windows'], url: 'https://github.com/campfirium/foliole/releases/tag/v0.9.0', version: '0.9.0' }
    ]
  });

  expect(selectLatestPlatformRelease(manifest!, '0.7.4', { architecture: 'x64', platform: 'linux' }))
    .toMatchObject({ url: 'https://github.com/campfirium/foliole/releases/tag/v0.8.0', version: '0.8.0' });
});
