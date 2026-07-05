import type http from 'node:http';

import { recordAgentControlAuditEvent, type AgentControlAuditSink } from './agentControlAudit.js';
import { isBearerTokenAuthorized } from './agentControlToken.js';
import {
  AGENT_CONTROL_CAPABILITIES,
  AGENT_CONTROL_PROTOCOL_VERSION
} from './agentControlTypes.js';

export interface AgentControlRequestHandlerOptions {
  appVersion: string;
  auditSink: AgentControlAuditSink;
  token: string;
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload)}\n`);
}

function readCallerId(request: http.IncomingMessage) {
  const header = request.headers['x-foliole-agent-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim().slice(0, 80) || 'local-agent';
}

function isAuthorized(request: http.IncomingMessage, token: string) {
  return isBearerTokenAuthorized(request.headers.authorization, token);
}

function recordRequest(args: {
  capability: string;
  errorCategory?: string;
  options: AgentControlRequestHandlerOptions;
  request: http.IncomingMessage;
  result: 'auth_failed' | 'failed' | 'success';
}) {
  recordAgentControlAuditEvent(args.options.auditSink, {
    capability: args.capability,
    callerId: readCallerId(args.request),
    ...(args.errorCategory ? { errorCategory: args.errorCategory } : {}),
    result: args.result
  });
}

function handleHealth(request: http.IncomingMessage, response: http.ServerResponse, options: AgentControlRequestHandlerOptions) {
  recordRequest({ capability: 'foundation.health', options, request, result: 'success' });
  sendJson(response, 200, {
    ok: true,
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION,
    service: 'foliole-agent-control',
    version: options.appVersion
  });
}

function requireAuthorized(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  capability: string
) {
  if (isAuthorized(request, options.token)) {
    return true;
  }
  recordRequest({ capability, errorCategory: 'unauthorized', options, request, result: 'auth_failed' });
  sendJson(response, 401, { error: 'unauthorized' });
  return false;
}

function handleCapabilities(request: http.IncomingMessage, response: http.ServerResponse, options: AgentControlRequestHandlerOptions) {
  const capability = 'foundation.capabilities';
  if (!requireAuthorized(request, response, options, capability)) return;
  recordRequest({ capability, options, request, result: 'success' });
  sendJson(response, 200, {
    capabilities: AGENT_CONTROL_CAPABILITIES.map((name) => ({ enabled: false, name })),
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION
  });
}

function handleVerify(request: http.IncomingMessage, response: http.ServerResponse, options: AgentControlRequestHandlerOptions) {
  const capability = 'foundation.auth.verify';
  if (!requireAuthorized(request, response, options, capability)) return;
  recordRequest({ capability, options, request, result: 'success' });
  sendJson(response, 200, { ok: true });
}

export function createAgentControlRequestHandler(options: AgentControlRequestHandlerOptions) {
  return (request: http.IncomingMessage, response: http.ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/agent-control/v1/health') {
      handleHealth(request, response, options);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/agent-control/v1/capabilities') {
      handleCapabilities(request, response, options);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/agent-control/v1/auth/verify') {
      handleVerify(request, response, options);
      return;
    }
    recordRequest({
      capability: 'foundation.route',
      errorCategory: 'not_found',
      options,
      request,
      result: 'failed'
    });
    sendJson(response, 404, { error: 'not_found' });
  };
}
