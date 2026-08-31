import type http from 'node:http';

import { AGENT_CONTROL_MATERIAL_WRITE_CONTENT_LIMIT, AgentMaterialMutationError } from './agentControlMaterialMutations.js';
import {
  createAgentControlMaterial,
  moveAgentControlMaterial,
  reorderAgentControlMaterials,
  restoreAgentControlMaterial
} from './agentControlMaterialStructureMutations.js';
import {
  readAuthorizedAgentControlBody,
  recordAgentControlRequest,
  sendAgentControlInvalidRequest,
  sendAgentControlJson
} from './agentControlMutationHandlerSupport.js';
import type { AgentControlRequestHandlerOptions } from './agentControlRequestHandler.js';

export async function handleMaterialCreate(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const capability = 'materials.create';
  const body = await readAuthorizedAgentControlBody(request, response, options, capability);
  if (!body) return;
  const title = readString(body.title);
  const kind = body.kind === 'folder' || body.kind === 'topic' ? body.kind : null;
  const content = body.content === undefined ? undefined : readString(body.content, false);
  const parentId = readNullableId(body.parent_id);
  if (!title || !kind || content === null || parentId === undefined || (content?.length ?? 0) > AGENT_CONTROL_MATERIAL_WRITE_CONTENT_LIMIT) {
    sendAgentControlInvalidRequest(request, response, options, capability);
    return;
  }
  sendMutation(request, response, options, capability, () => ({
    material: createAgentControlMaterial({ ...(content === undefined ? {} : { content }), kind, parentId, title })
  }));
}

export async function handleMaterialMove(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const capability = 'materials.move';
  const body = await readAuthorizedAgentControlBody(request, response, options, capability);
  if (!body) return;
  const id = readString(body.id);
  const expectedUpdatedAt = readString(body.expected_updated_at);
  const parentId = readNullableId(body.parent_id);
  if (!id || !expectedUpdatedAt || parentId === undefined) return sendAgentControlInvalidRequest(request, response, options, capability);
  sendMutation(request, response, options, capability, () => ({
    material: moveAgentControlMaterial({ expectedUpdatedAt, id, parentId })
  }), id);
}

export async function handleMaterialReorder(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const capability = 'materials.reorder';
  const body = await readAuthorizedAgentControlBody(request, response, options, capability);
  if (!body) return;
  const parentId = readNullableId(body.parent_id);
  const materialIds = readIds(body.material_ids);
  if (parentId === undefined || !materialIds) return sendAgentControlInvalidRequest(request, response, options, capability);
  sendMutation(request, response, options, capability, () => reorderAgentControlMaterials({ materialIds, parentId }), parentId ?? undefined);
}

export async function handleMaterialRestore(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions
) {
  const capability = 'materials.restore';
  const body = await readAuthorizedAgentControlBody(request, response, options, capability);
  if (!body) return;
  const id = readString(body.id);
  const expectedUpdatedAt = readString(body.expected_updated_at);
  if (!id || !expectedUpdatedAt) return sendAgentControlInvalidRequest(request, response, options, capability);
  sendMutation(request, response, options, capability, () => restoreAgentControlMaterial(id, expectedUpdatedAt), id);
}

function sendMutation(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  capability: string,
  mutate: () => Record<string, unknown>,
  targetId?: string
) {
  try {
    const payload = mutate();
    recordAgentControlRequest({ capability, options, request, result: 'success', ...(targetId ? { targetId } : {}) });
    sendAgentControlJson(response, 200, payload);
  } catch (error) {
    if (!(error instanceof AgentMaterialMutationError)) throw error;
    recordAgentControlRequest({ capability, errorCategory: error.category, options, request, result: 'failed', ...(targetId ? { targetId } : {}) });
    sendAgentControlJson(response, error.statusCode, { error: error.category });
  }
}

function readString(value: unknown, trim = true) {
  if (typeof value !== 'string') return null;
  return trim ? value.trim() || null : value;
}

function readNullableId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return readString(value) ?? undefined;
}

function readIds(value: unknown) {
  if (!Array.isArray(value)) return null;
  const ids = value.map((item) => readString(item));
  return ids.length > 0 && ids.every(Boolean) && new Set(ids).size === ids.length ? ids as string[] : null;
}
