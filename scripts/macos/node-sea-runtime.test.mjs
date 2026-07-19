// @vitest-environment node

import path from 'node:path';

import { expect, it } from 'vitest';

import { NODE_SEA_RELEASE, resolveNodeSeaReleasePaths } from './node-sea-runtime.mjs';

it('pins the official arm64 Node SEA runtime and checksum', () => {
  expect(NODE_SEA_RELEASE).toEqual({
    archive: 'node-v22.23.1-darwin-arm64.tar.gz',
    sha256: 'ef28d8fab2c0e4314522d4bb1b7173270aa3937e93b92cb7de79c112ac1fa953',
    version: '22.23.1'
  });
  expect(resolveNodeSeaReleasePaths('/repo').nodePath).toBe(
    path.join('/repo', '.tmp/macos/node-sea-runtime/node-v22.23.1-darwin-arm64/bin/node')
  );
});
