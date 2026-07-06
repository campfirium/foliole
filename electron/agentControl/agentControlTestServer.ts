import type http from 'node:http';
import type { AddressInfo } from 'node:net';

import { createAgentControlHttpServer } from './agentControlServer.js';
import type { AgentControlAuditEvent } from './agentControlTypes.js';

export async function startAgentControlTestServer(
  auditEvents: AgentControlAuditEvent[] = [],
  notifyWorkspaceContentChanged?: () => void
) {
  const server = createAgentControlHttpServer({
    appVersion: '0.1.0-test',
    auditSink: (event) => {
      auditEvents.push(event);
    },
    ...(notifyWorkspaceContentChanged ? { notifyWorkspaceContentChanged } : {}),
    token: 'test-token'
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

export function closeAgentControlTestServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}