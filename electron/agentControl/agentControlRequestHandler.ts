import type http from 'node:http';

import { recordAgentControlAuditEvent, type AgentControlAuditSink } from './agentControlAudit.js';
import { isCapabilityEnabled } from './agentControlCapabilities.js';
import {
  handleMaterialDeleteSoft,
  handleMaterialRead,
  handleMaterialSearch,
  handleMaterialUpdate
} from './agentControlMaterialHandlers.js';
import { isBearerTokenAuthorized } from './agentControlToken.js';
import {
  AGENT_CONTROL_CAPABILITIES,
  AGENT_CONTROL_PROTOCOL_VERSION
} from './agentControlTypes.js';
import type { AgentControlRuntimeIdentity } from './agentControlTypes.js';
import {
  handleVirtualFolderAddItems,
  handleVirtualFolderCreate,
  handleVirtualFolderList,
  handleVirtualFolderRead,
  handleVirtualFolderRemoveItems,
  handleVirtualFolderReorder
} from './agentControlVirtualFolderHandlers.js';
import { isMaterialWritePath, isVirtualFolderWritePath, notifyAfterSuccessfulWrite } from './agentControlWriteNotifications.js';

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

function capabilityForProtectedPath(method: string | undefined, pathname: string): string | null {
  if (method === 'GET' && pathname === '/agent-control/v1/capabilities') return 'foundation.capabilities';
  if (method === 'POST' && pathname === '/agent-control/v1/auth/verify') return 'foundation.auth.verify';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/materials/read') return 'materials.read';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/materials/search') return 'materials.search';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/materials/update') return 'materials.update';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/materials/delete-soft') return 'materials.deleteSoft';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/list') return 'virtualFolders.list';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/read') return 'virtualFolders.read';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/create') return 'virtualFolders.create';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/add-items') return 'virtualFolders.addItems';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/remove-items') return 'virtualFolders.removeItems';
  if ((method === 'POST' || method === 'OPTIONS') && pathname === '/agent-control/v1/virtual-folders/reorder') return 'virtualFolders.reorder';
  return null;
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
  if (await handleMaterialRoutes(request, response, options, url.pathname)) {
    return;
  }
  if (await handleVirtualFolderRoutes(request, response, options, url.pathname)) {
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

async function handleMaterialRoutes(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  pathname: string
) {
  if (request.method !== 'POST') return false;
  if (pathname === '/agent-control/v1/materials/read') await handleMaterialRead(request, response, options);
  else if (pathname === '/agent-control/v1/materials/search') await handleMaterialSearch(request, response, options);
  else if (pathname === '/agent-control/v1/materials/update') await handleMaterialUpdate(request, response, options);
  else if (pathname === '/agent-control/v1/materials/delete-soft') await handleMaterialDeleteSoft(request, response, options);
  else return false;
  if (isMaterialWritePath(pathname)) {
    notifyAfterSuccessfulWrite(response, options.notifyWorkspaceContentChanged);
  }
  return true;
}

async function handleVirtualFolderRoutes(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  pathname: string
) {
  if (request.method !== 'POST') return false;
  if (pathname === '/agent-control/v1/virtual-folders/list') await handleVirtualFolderList(request, response, options);
  else if (pathname === '/agent-control/v1/virtual-folders/read') await handleVirtualFolderRead(request, response, options);
  else if (pathname === '/agent-control/v1/virtual-folders/create') await handleVirtualFolderCreate(request, response, options);
  else if (pathname === '/agent-control/v1/virtual-folders/add-items') await handleVirtualFolderAddItems(request, response, options);
  else if (pathname === '/agent-control/v1/virtual-folders/remove-items') await handleVirtualFolderRemoveItems(request, response, options);
  else if (pathname === '/agent-control/v1/virtual-folders/reorder') await handleVirtualFolderReorder(request, response, options);
  else return false;
  if (isVirtualFolderWritePath(pathname)) {
    notifyAfterSuccessfulWrite(response, options.notifyWorkspaceContentChanged);
  }
  return true;
}
