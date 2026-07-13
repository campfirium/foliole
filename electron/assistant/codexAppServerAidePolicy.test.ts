// @vitest-environment node

import { expect, it } from 'vitest';

import { createAideThreadStartParams, createAideTurnStartParams } from './codexAppServerAidePolicy.js';

it('uses the app-server sandbox policy wire values', () => {
  expect(createAideThreadStartParams('/widgets')).toMatchObject({
    sandbox: 'workspace-write'
  });
  expect(createAideTurnStartParams('/widgets', 'thread-1', 'Hello')).toMatchObject({
    sandboxPolicy: { type: 'workspaceWrite' }
  });
});
