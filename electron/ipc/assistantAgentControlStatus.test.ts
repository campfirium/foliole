// @vitest-environment node

import { expect, it } from 'vitest';

import type { NativeAssistantStatusResult } from '../../lib/platform/nativeAssistantContract.js';

import { mergeAssistantStatusWithAgentControl } from './assistantAgentControlStatus.js';

const readyStatus: NativeAssistantStatusResult = {
  capabilities: [
    { enabled: true, name: 'status' },
    { enabled: true, name: 'sendMessage' },
    { enabled: true, name: 'threadIndex' }
  ],
  provider: 'codex-app-server',
  state: 'ready'
};

it('keeps App Server chat ready when Agent Control is not running', () => {
  expect(mergeAssistantStatusWithAgentControl(readyStatus, {
    capabilities: ['materials.read'],
    descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
    descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
    state: 'failed'
  })).toMatchObject({
    capabilities: expect.arrayContaining([
      { enabled: false, name: 'agentControl' },
      { enabled: true, name: 'sendMessage' }
    ]),
    state: 'ready'
  });
});

it('exposes Agent Control as enabled when the local tools are running', () => {
  expect(mergeAssistantStatusWithAgentControl(readyStatus, {
    capabilities: ['materials.read'],
    descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
    descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
    endpoint: 'http://127.0.0.1:5000',
    state: 'running'
  })).toMatchObject({
    capabilities: expect.arrayContaining([
      { enabled: true, name: 'agentControl' },
      { enabled: true, name: 'sendMessage' }
    ]),
    state: 'ready'
  });
});
