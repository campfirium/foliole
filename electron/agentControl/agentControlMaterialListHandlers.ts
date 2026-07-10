import type http from 'node:http';

import { recordAgentControlAuditEvent } from './agentControlAudit.js';
import {
  AGENT_CONTROL_MATERIAL_CHILDREN_LIMIT,
  listAgentControlMaterialChildren,
  normalizeBodyObject,
  normalizeOptionalLimit,
  readAgentControlJsonBody
} from './agentControlMaterials.js';
import type { AgentControlRequestHandlerOptions } from './agentControlRequestHandler.js';
import { isBearerTokenAuthorized } from './agentControlToken.js';

function sendJson(response: http.ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload)}\n`);
}

function readCallerId(request: http.IncomingMessage) {
  const header = request.headers['x-foliole-agent-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim().slice(0, 80) || 'local-agent';
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

export async function handleMaterialListChildren(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const capability = 'materials.listChildren';
  if (!isBearerTokenAuthorized(request.headers.authorization, options.token)) {
    recordRequest({ capability, errorCategory: 'unauthorized', options, request, result: 'auth_failed' });
    sendJson(response, 401, { error: 'unauthorized' });
    return;
  }
  const body = await readJsonBodyOrFail(request, response, options, capability);
  if (!body) return;
  const parentId = typeof body.parent_id === 'string' ? body.parent_id.trim() : null;
  if (Object.hasOwn(body, 'parent_id') && !parentId) {
    recordRequest({ capability, errorCategory: 'invalid_request', options, request, result: 'failed' });
    sendJson(response, 400, { error: 'invalid_request' });
    return;
  }
  const limit = normalizeOptionalLimit(body.limit, AGENT_CONTROL_MATERIAL_CHILDREN_LIMIT, AGENT_CONTROL_MATERIAL_CHILDREN_LIMIT);
  const payload = listAgentControlMaterialChildren(parentId, limit);
  if (parentId && !payload.parent) {
    recordRequest({ capability, errorCategory: 'not_found', options, request, result: 'failed', targetId: parentId });
    sendJson(response, 404, { error: 'not_found' });
    return;
  }
  recordRequest({ capability, options, request, result: 'success', ...(parentId ? { targetId: parentId } : {}) });
  sendJson(response, 200, payload as unknown as Record<string, unknown>);
}
