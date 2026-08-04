// @vitest-environment node

import { expect, it } from 'vitest';

import {
  createAideSkillsRootsRequest,
  createAideThreadRequest,
  createAideThreadStartParams,
  createAideTurnStartParams
} from './codexAppServerAidePolicy.js';

it('uses the app-server sandbox policy wire values', () => {
  expect(createAideThreadStartParams('/runtime', 'Aide rules', ['materials.read'])).toMatchObject({
    cwd: '/runtime',
    developerInstructions: 'Aide rules',
    dynamicTools: [expect.objectContaining({ name: 'foliole' })],
    sandbox: 'read-only'
  });
  expect(createAideTurnStartParams('/widgets', 'thread-1', 'Hello')).toMatchObject({
    sandboxPolicy: { networkAccess: 'restricted', type: 'externalSandbox' }
  });
  expect(createAideTurnStartParams('/widgets', 'thread-1', 'Describe this', ['/widgets/image.png']).input)
    .toEqual([
      { text: 'Describe this', type: 'text' },
      { path: '/widgets/image.png', type: 'localImage' }
    ]);
  expect(createAideTurnStartParams('/widgets', 'thread-1', 'Configured', [], {
    effort: 'high', model: 'gpt-test', serviceTier: 'fast'
  })).toMatchObject({ effort: 'high', model: 'gpt-test', serviceTier: 'fast' });
});

it('registers only Foliole Aide managed skill roots', () => {
  expect(createAideSkillsRootsRequest(1, ['/library/Widgets/Foliole Aide/Skills'])).toEqual({
    id: 1,
    method: 'skills/extraRoots/set',
    params: { extraRoots: ['/library/Widgets/Foliole Aide/Skills'] }
  });
});

it('applies managed developer instructions when resuming a thread', () => {
  expect(createAideThreadRequest(7, '/runtime', 'Current Aide rules', 'thread-1')).toEqual({
    id: 7,
    method: 'thread/resume',
    params: {
      cwd: '/runtime',
      developerInstructions: 'Current Aide rules',
      threadId: 'thread-1'
    }
  });
});
