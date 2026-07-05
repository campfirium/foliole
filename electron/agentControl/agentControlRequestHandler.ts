import type http from 'node:http';

import { recordAgentControlAuditEvent, type AgentControlAuditSink } from './agentControlAudit.js';
import {
  AGENT_CONTROL_MATERIAL_SEARCH_LIMIT,
  AGENT_CONTROL_MATERIAL_SEARCH_MAX_LIMIT,
  normalizeBodyObject,
  normalizeOptionalLimit,
  readAgentControlJsonBody,
  readAgentControlMaterial,
  searchAgentControlMaterials
} from './agentControlMaterials.js';
import { isBearerTokenAuthorized } from './agentControlToken.js';
import {
  AGENT_CONTROL_CAPABILITIES,
  AGENT_CONTROL_PROTOCOL_VERSION
} from './agentControlTypes.js';
import type { AgentControlCapability, AgentControlCapabilityStatus } from './agentControlTypes.js';
import { handleVirtualFolderList, handleVirtualFolderRead } from './agentControlVirtualFolderHandlers.js';

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
    void handleRequest(request, response, options).catch(() => {
      sendJson(response, 500, { error: 'internal_error' });
    });
  };
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
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
  if (request.method === 'POST' && url.pathname === '/agent-control/v1/materials/read') {
    await handleMaterialRead(request, response, options);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/agent-control/v1/materials/search') {
    await handleMaterialSearch(request, response, options);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/agent-control/v1/virtual-folders/list') {
    await handleVirtualFolderList(request, response, options);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/agent-control/v1/virtual-folders/read') {
    await handleVirtualFolderRead(request, response, options);
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

function isCapabilityEnabled(name: AgentControlCapability): AgentControlCapabilityStatus['enabled'] {
  return name === 'materials.read' ||
    name === 'materials.search' ||
    name === 'virtualFolders.list' ||
    name === 'virtualFolders.read';
}

async function readJsonBodyOrFail(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  capability: string
) {
  const body = await readAgentControlJsonBody(request);
  if (!body.ok) {
    recordRequest({ capability, errorCategory: body.errorCategory, options, request, result: 'failed' });
    sendJson(response, body.statusCode, { error: body.error });
    return null;
  }
  const object = normalizeBodyObject(body.value);
  if (!object) {
    recordRequest({ capability, errorCategory: 'invalid_request', options, request, result: 'failed' });
    sendJson(response, 400, { error: 'invalid_request' });
    return null;
  }
  return object;
}

async function handleMaterialRead(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const capability = 'materials.read';
  if (!requireAuthorized(request, response, options, capability)) return;
  const body = await readJsonBodyOrFail(request, response, options, capability);
  if (!body) return;
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    recordRequest({ capability, errorCategory: 'invalid_request', options, request, result: 'failed' });
    sendJson(response, 400, { error: 'invalid_request' });
    return;
  }
  const material = readAgentControlMaterial(id);
  if (!material) {
    recordRequest({ capability, errorCategory: 'not_found', options, request, result: 'failed', targetId: id });
    sendJson(response, 404, { error: 'not_found' });
    return;
  }
  recordRequest({ capability, options, request, result: 'success', targetId: id });
  sendJson(response, 200, { material });
}

async function handleMaterialSearch(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const capability = 'materials.search';
  if (!requireAuthorized(request, response, options, capability)) return;
  const body = await readJsonBodyOrFail(request, response, options, capability);
  if (!body) return;
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) {
    recordRequest({ capability, errorCategory: 'invalid_request', options, request, result: 'failed' });
    sendJson(response, 400, { error: 'invalid_request' });
    return;
  }
  const limit = normalizeOptionalLimit(body.limit, AGENT_CONTROL_MATERIAL_SEARCH_LIMIT, AGENT_CONTROL_MATERIAL_SEARCH_MAX_LIMIT);
  const payload = searchAgentControlMaterials(query, limit);
  recordRequest({ capability, options, request, result: 'success' });
  sendJson(response, 200, payload as unknown as Record<string, unknown>);
}
