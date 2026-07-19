// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildSeaConfig } from './prepare-foliole-cli.mjs';

describe('Foliole macOS CLI preparation', () => {
  it('builds a deterministic Node SEA blob from the checked-in bootstrap', () => {
    const config = buildSeaConfig('/tmp/foliole-cli.blob');

    expect(config).toEqual({
      disableExperimentalSEAWarning: true,
      main: path.resolve('scripts/macos/foliole-cli-launcher/bootstrap.cjs'),
      output: '/tmp/foliole-cli.blob',
      useCodeCache: false,
      useSnapshot: false
    });
  });
});
