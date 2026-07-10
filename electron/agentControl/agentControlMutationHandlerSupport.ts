import type http from 'node:http';

import { recordAgentControlAuditEvent } from './agentControlAudit.js';
import { normalizeBodyObject, readAgentControlJsonBody } from './agentControlMaterials.js';
import type { AgentControlRequestHandlerOptions } from './agentControlRequestHandler.js';
import { isBearerTokenAuthorized } from './agentControlToken.js';

export function sendAgentControlJson(
  response: http.ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload)}\n`);
}

export function recordAgentControlRequest(args: {
  capability: string;
  errorCategory?: string;
  options: AgentControlRequestHandlerOptions;
  request: http.IncomingMessage;
  result: 'auth_failed' | 'failed' | 'success';
  targetId?: string;
}) {
  const header = args.request.headers['x-foliole-agent-id'];
  const callerId = (Array.isArray(header) ? header[0] : header)?.trim().slice(0, 80) || 'local-agent';
  recordAgentControlAuditEvent(args.options.auditSink, {
    capability: args.capability, callerId,
    ...(args.errorCategory ? { errorCategory: args.errorCategory } : {}),
    result: args.result,
    ...(args.targetId ? { targetId: args.targetId } : {})
  });
}

export async function readAuthorizedAgentControlBody(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  capability: string
) {
  if (!isBearerTokenAuthorized(request.headers.authorization, options.token)) {
    recordAgentControlRequest({ capability, errorCategory: 'unauthorized', options, request, result: 'auth_failed' });
    sendAgentControlJson(response, 401, { error: 'unauthorized' });
    return null;
  }
  const body = await readAgentControlJsonBody(request);
  const object = body.ok ? normalizeBodyObject(body.value) : null;
  if (!body.ok || !object) {
    const error = body.ok ? 'invalid_request' : body.error;
    recordAgentControlRequest({ capability, errorCategory: 'invalid_request', options, request, result: 'failed' });
    sendAgentControlJson(response, body.ok ? 400 : body.statusCode, { error });
    return null;
  }
  return object;
}

export function sendAgentControlInvalidRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  capability: string
) {
  recordAgentControlRequest({ capability, errorCategory: 'invalid_request', options, request, result: 'failed' });
  sendAgentControlJson(response, 400, { error: 'invalid_request' });
}
