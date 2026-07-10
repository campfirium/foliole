// @vitest-environment node
import { expect, it } from 'vitest';

import { CodexAppServerMcpApprovalPolicy } from './codexAppServerMcpApproval.js';

it('accepts only tracked Foliole read-tool confirmations', () => {
  const policy = new CodexAppServerMcpApprovalPolicy();
  policy.observe(toolStarted('foliole_agent_control', 'foliole_materials_read'));

  expect(policy.observe(approvalRequest())).toEqual({
    id: 7,
    result: { action: 'accept', content: {} }
  });
});

it.each([
  ['other_server', 'foliole_materials_read', 'form', []],
  ['foliole_agent_control', 'foliole_materials_update', 'form', []],
  ['foliole_agent_control', 'foliole_materials_read', 'url', []],
  ['foliole_agent_control', 'foliole_materials_read', 'form', ['confirmation']]
])('declines untrusted or interactive elicitation: %s %s', (server, tool, mode, required) => {
  const policy = new CodexAppServerMcpApprovalPolicy();
  policy.observe(toolStarted(server, tool));

  expect(policy.observe(approvalRequest(mode, required))).toEqual({
    id: 7,
    result: { action: 'decline', content: null }
  });
});

function toolStarted(server: string, tool: string) {
  return {
    method: 'item/started',
    params: {
      item: { server, tool, type: 'mcpToolCall' },
      threadId: 'thread-1',
      turnId: 'turn-1'
    }
  };
}

function approvalRequest(mode = 'form', required: string[] = []) {
  return {
    id: 7,
    method: 'mcpServer/elicitation/request',
    params: {
      mode,
      requestedSchema: { properties: {}, required, type: 'object' },
      serverName: 'foliole_agent_control',
      threadId: 'thread-1',
      turnId: 'turn-1'
    }
  };
}
