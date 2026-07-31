// @vitest-environment node
import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

const agentControlStatus = vi.hoisted(() => ({
  value: {
    endpoint: null as null | string,
    last_error: null as null | string,
    port: null as null | number,
    state: 'stopped' as 'failed' | 'running' | 'stopped'
  }
}));

vi.mock('../agentControl/agentControlServer.js', () => ({
  getAgentControlApiServerStatus: () => agentControlStatus.value,
  getAgentControlSessionDescriptorPath: () => 'C:\\Foliole\\cache\\agent-control-session.json'
}));

import {
  resolveAssistantAgentControlCommandPath,
  resolveAssistantAgentControlContext,
  resolveAssistantAgentDescriptorPath
} from './assistantAgentControlContext.js';

beforeEach(() => {
  agentControlStatus.value = { endpoint: null, last_error: null, port: null, state: 'stopped' };
});

it('resolves the private descriptor and stable command without putting them in model context', () => {
  expect(resolveAssistantAgentDescriptorPath({})).toBe('C:\\Foliole\\cache\\agent-control-session.json');
  expect(resolveAssistantAgentControlCommandPath({}, 'C:\\opt\\foliole\\resources', 'win32')).toBe(
    path.win32.join('C:\\opt\\foliole\\resources', 'scripts', 'agent-control', 'foliole.cmd')
  );
  expect(resolveAssistantAgentControlContext()).toEqual({
    capabilities: expect.arrayContaining(['materials.create', 'materials.update', 'materials.restore']),
    state: 'stopped'
  });
});

it('exposes only a bounded startup error with the product capability state', () => {
  agentControlStatus.value = {
    endpoint: null, last_error: 'listen EADDRINUSE 127.0.0.1:5000', port: null, state: 'failed'
  };
  expect(resolveAssistantAgentControlContext()).toMatchObject({
    lastError: 'listen EADDRINUSE 127.0.0.1:5000', state: 'failed'
  });
});
