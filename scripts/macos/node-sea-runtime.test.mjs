// @vitest-environment node

import path from 'node:path';

import { expect, it } from 'vitest';

import { NODE_SEA_RELEASE, resolveNodeSeaReleasePaths } from './node-sea-runtime.mjs';

it('pins the official arm64 Node SEA runtime and checksum', () => {
  expect(NODE_SEA_RELEASE).toEqual({
    archive: 'node-v22.23.4-darwin-arm64.tar.gz',
    sha256: 'c9e1dbc748b33ed2d14f42445191ecaf14c56259c7a9a26d0042c49ec2b66428',
    version: '22.23.4'
  });
  expect(resolveNodeSeaReleasePaths('/repo').nodePath).toBe(
    path.join('/repo', '.tmp/macos/node-sea-runtime/node-v22.23.4-darwin-arm64/bin/node')
  );
});
