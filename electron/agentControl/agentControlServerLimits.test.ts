// @vitest-environment node
import { expect, it } from 'vitest';

import { AGENT_CONTROL_HTTP_LIMITS, createAgentControlHttpServer } from './agentControlServer.js';

it('uses bounded HTTP server timeouts', () => {
  const server = createAgentControlHttpServer({
    appVersion: '0.1.0-test',
    auditSink: () => undefined,
    token: 'token'
  });

  expect(server.headersTimeout).toBe(AGENT_CONTROL_HTTP_LIMITS.headersTimeout);
  expect(server.keepAliveTimeout).toBe(AGENT_CONTROL_HTTP_LIMITS.keepAliveTimeout);
  expect(server.requestTimeout).toBe(AGENT_CONTROL_HTTP_LIMITS.requestTimeout);
});