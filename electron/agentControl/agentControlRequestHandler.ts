import type http from 'node:http';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { recordAgentControlAuditEvent, type AgentControlAuditSink } from './agentControlAudit.js';
import { isCapabilityEnabled } from './agentControlCapabilities.js';
import {
  capabilityForProtectedPath,
  isProtectedRouteCapabilityDisabled
} from './agentControlRouteCapabilities.js';
import {
  handleAgentControlMaterialRoute,
  handleAgentControlVirtualFolderRoute
} from './agentControlRouteDispatch.js';
import { isBearerTokenAuthorized } from './agentControlToken.js';
import {
  AGENT_CONTROL_CAPABILITIES,
  AGENT_CONTROL_PROTOCOL_VERSION
} from './agentControlTypes.js';
import type { AgentControlRuntimeIdentity } from './agentControlTypes.js';

export interface AgentControlRequestHandlerOptions {
  appVersion: string;
  auditSink: AgentControlAuditSink;
  notifyWorkspaceContentChanged?: () => void;
  runtimeIdentity: AgentControlRuntimeIdentity;
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
  targetId?: string;
}) {
  recordAgentControlAuditEvent(args.options.auditSink, {
    capability: args.capability,
    callerId: readCallerId(args.request),
    ...(args.errorCategory ? { errorCategory: args.errorCategory } : {}),
    result: args.result,
    ...(args.targetId ? { targetId: args.targetId } : {})
  });
}

function handleHealth(request: http.IncomingMessage, response: http.ServerResponse, options: AgentControlRequestHandlerOptions) {
  recordRequest({ capability: 'foundation.health', options, request, result: 'success' });
  sendJson(response, 200, {
    ok: true,
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION,
    runtime_identity: options.runtimeIdentity,
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
    capabilities: AGENT_CONTROL_CAPABILITIES.map((name) => ({ enabled: isCapabilityEnabled(name), name })),
    protocol_version: AGENT_CONTROL_PROTOCOL_VERSION,
    runtime_identity: options.runtimeIdentity
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
    void handleRequest(request, response, options).catch(() => {
      sendJson(response, 500, { error: 'internal_error' });
    });
  };
}
function readOrigin(request: http.IncomingMessage) {
  const header = request.headers.origin;
  return Array.isArray(header) ? header[0] : header;
}

function rejectDisabledCapability(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  pathname: string
) {
  const capability = capabilityForProtectedPath(request.method, pathname);
  if (!capability || !isProtectedRouteCapabilityDisabled(capability)) return false;
  recordRequest({ capability, errorCategory: 'capability_disabled', options, request, result: 'failed' });
  sendJson(response, 403, { error: 'capability_disabled' });
  return true;
}

function rejectForbiddenOrigin(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  pathname: string
) {
  if (!readOrigin(request)) return false;
  const capability = capabilityForProtectedPath(request.method, pathname);
  if (!capability) return false;
  recordRequest({ capability, errorCategory: 'forbidden_origin', options, request, result: 'auth_failed' });
  sendJson(response, 403, { error: 'forbidden_origin' });
  return true;
}
async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (rejectForbiddenOrigin(request, response, options, url.pathname)) {
    return;
  }
  if (rejectDisabledCapability(request, response, options, url.pathname)) {
    return;
  }
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
  const capability = capabilityForProtectedPath(request.method, url.pathname);
  if (capability && await runWithDatabaseConnectionOwner(async () => {
    if (await handleAgentControlMaterialRoute(request, response, options, url.pathname)) return true;
    return handleAgentControlVirtualFolderRoute(request, response, options, url.pathname);
  })) {
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
}
