// @vitest-environment node

import { expect, it } from 'vitest';

import { createAideThreadStartParams, createAideTurnStartParams } from './codexAppServerAidePolicy.js';

it('uses the app-server sandbox policy wire values', () => {
  expect(createAideThreadStartParams('/widgets', ['materials.read'])).toMatchObject({
    dynamicTools: [expect.objectContaining({ name: 'foliole' })],
    sandbox: 'read-only'
  });
  expect(createAideTurnStartParams('/widgets', 'thread-1', 'Hello')).toMatchObject({
    sandboxPolicy: { networkAccess: 'restricted', type: 'externalSandbox' }
  });
});
