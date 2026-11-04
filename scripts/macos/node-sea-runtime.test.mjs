// @vitest-environment node

import path from 'node:path';

import { expect, it } from 'vitest';

import { NODE_SEA_RELEASE, resolveNodeSeaReleasePaths } from './node-sea-runtime.mjs';

it('pins the official arm64 Node SEA runtime and checksum', () => {
  expect(NODE_SEA_RELEASE).toEqual({
    archive: 'node-v24.22.2-darwin-arm64.tar.gz',
    sha256: 'aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a',
    version: '24.22.2'
  });
  expect(resolveNodeSeaReleasePaths('/repo').nodePath).toBe(
    path.join('/repo', '.tmp/macos/node-sea-runtime/node-v24.22.2-darwin-arm64/bin/node')
  );
});
