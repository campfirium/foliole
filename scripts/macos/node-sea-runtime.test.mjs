// @vitest-environment node

import path from 'node:path';

import { expect, it } from 'vitest';

import { NODE_SEA_RELEASE, resolveNodeSeaReleasePaths } from './node-sea-runtime.mjs';

it('pins the official arm64 Node SEA runtime and checksum', () => {
  expect(NODE_SEA_RELEASE).toEqual({
    archive: 'node-v26.13.0-darwin-arm64.tar.gz',
    sha256: 'd38bd5e5a2ddce6bbb5ce45e46e208337da4d51fffe611e567fd32073d6439f6',
    version: '26.13.0'
  });
  expect(resolveNodeSeaReleasePaths('/repo').nodePath).toBe(
    path.join('/repo', '.tmp/macos/node-sea-runtime/node-v26.13.0-darwin-arm64/bin/node')
  );
});
