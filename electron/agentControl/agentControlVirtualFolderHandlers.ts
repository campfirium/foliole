import type http from 'node:http';

import { recordAgentControlAuditEvent } from './agentControlAudit.js';
import {
  normalizeBodyObject,
  readAgentControlJsonBody
} from './agentControlMaterials.js';
import type { AgentControlRequestHandlerOptions } from './agentControlRequestHandler.js';
import { isBearerTokenAuthorized } from './agentControlToken.js';
import {
  addAgentControlVirtualFolderItems,
  AgentVirtualFolderMutationError,
  type AgentVirtualFolderMutationResult,
  createAgentControlVirtualFolder,
  removeAgentControlVirtualFolderItems,
  reorderAgentControlVirtualFolderItems
} from './agentControlVirtualFolderMutations.js';
import {
  listAgentControlVirtualFolders,
  normalizeVirtualFolderItemLimit,
  normalizeVirtualFolderListLimit,
  readAgentControlVirtualFolder
} from './agentControlVirtualFolders.js';

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

function requireAuthorized(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  capability: string
) {
  if (isBearerTokenAuthorized(request.headers.authorization, options.token)) {
    return true;
  }
  recordRequest({ capability, errorCategory: 'unauthorized', options, request, result: 'auth_failed' });
  sendJson(response, 401, { error: 'unauthorized' });
  return false;
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

export async function handleVirtualFolderList(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const capability = 'virtualFolders.list';
  if (!requireAuthorized(request, response, options, capability)) return;
  const body = await readJsonBodyOrFail(request, response, options, capability);
  if (!body) return;
  const payload = listAgentControlVirtualFolders(normalizeVirtualFolderListLimit(body.limit));
  recordRequest({ capability, options, request, result: 'success' });
  sendJson(response, 200, payload as unknown as Record<string, unknown>);
}

export async function handleVirtualFolderRead(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const capability = 'virtualFolders.read';
  if (!requireAuthorized(request, response, options, capability)) return;
  const body = await readJsonBodyOrFail(request, response, options, capability);
  if (!body) return;
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    recordRequest({ capability, errorCategory: 'invalid_request', options, request, result: 'failed' });
    sendJson(response, 400, { error: 'invalid_request' });
    return;
  }
  const payload = readAgentControlVirtualFolder(id, normalizeVirtualFolderItemLimit(body.limit));
  if (!payload) {
    recordRequest({ capability, errorCategory: 'not_found', options, request, result: 'failed', targetId: id });
    sendJson(response, 404, { error: 'not_found' });
    return;
  }
  recordRequest({ capability, options, request, result: 'success', targetId: id });
  sendJson(response, 200, payload as unknown as Record<string, unknown>);
}

export async function handleVirtualFolderCreate(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const capability = 'virtualFolders.create';
  if (!requireAuthorized(request, response, options, capability)) return;
  const body = await readJsonBodyOrFail(request, response, options, capability);
  if (!body) return;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!title) {
    sendInvalidRequest(request, response, options, capability);
    return;
  }
  const payload = createAgentControlVirtualFolder({ description, title });
  recordRequest({ capability, options, request, result: 'success', targetId: payload.folder_id });
  sendJson(response, 200, payload as unknown as Record<string, unknown>);
}

export async function handleVirtualFolderAddItems(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  await handleMutationListRequest(request, response, options, {
    capability: 'virtualFolders.addItems',
    field: 'material_ids',
    mutate: (folderId, ids) => addAgentControlVirtualFolderItems({ folderId, materialIds: ids })
  });
}

export async function handleVirtualFolderRemoveItems(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  await handleMutationListRequest(request, response, options, {
    capability: 'virtualFolders.removeItems',
    field: 'item_ids',
    mutate: (folderId, ids) => removeAgentControlVirtualFolderItems({ folderId, itemIds: ids })
  });
}

export async function handleVirtualFolderReorder(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  await handleMutationListRequest(request, response, options, {
    capability: 'virtualFolders.reorder',
    field: 'item_ids',
    mutate: (folderId, ids) => reorderAgentControlVirtualFolderItems({ folderId, itemIds: ids }),
    rejectDuplicates: true
  });
}

async function handleMutationListRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  args: {
    capability: string;
    field: 'item_ids' | 'material_ids';
    mutate: (folderId: string, ids: string[]) => AgentVirtualFolderMutationResult;
    rejectDuplicates?: boolean;
  }
) {
  if (!requireAuthorized(request, response, options, args.capability)) return;
  const body = await readJsonBodyOrFail(request, response, options, args.capability);
  if (!body) return;
  const folderId = typeof body.folder_id === 'string' ? body.folder_id.trim() : '';
  const ids = normalizeIdList(body[args.field], args.rejectDuplicates ?? false);
  if (!folderId || !ids) {
    sendInvalidRequest(request, response, options, args.capability);
    return;
  }
  try {
    const payload = args.mutate(folderId, ids);
    recordRequest({ capability: args.capability, options, request, result: 'success', targetId: folderId });
    sendJson(response, 200, payload as unknown as Record<string, unknown>);
  } catch (error) {
    if (error instanceof AgentVirtualFolderMutationError) {
      recordRequest({ capability: args.capability, errorCategory: error.category, options, request, result: 'failed', targetId: folderId });
      sendJson(response, error.statusCode, { error: error.category });
      return;
    }
    throw error;
  }
}

function sendInvalidRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  capability: string
) {
  recordRequest({ capability, errorCategory: 'invalid_request', options, request, result: 'failed' });
  sendJson(response, 400, { error: 'invalid_request' });
}

function normalizeIdList(value: unknown, rejectDuplicates: boolean) {
  if (!Array.isArray(value)) return null;
  const ids = value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean);
  if (ids.length === 0) return null;
  const uniqueIds = Array.from(new Set(ids));
  if (rejectDuplicates && uniqueIds.length !== ids.length) return null;
  return uniqueIds;
}
