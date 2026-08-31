import type http from 'node:http';

import {
  AGENT_CONTROL_MATERIAL_WRITE_CONTENT_LIMIT,
  AGENT_CONTROL_MATERIAL_WRITE_REVEAL_LIMIT,
  AgentMaterialMutationError
} from './agentControlMaterialMutations.js';
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
  const kind = body.kind === 'folder' || body.kind === 'topic' || body.kind === 'item' ? body.kind : null;
  const content = body.content === undefined ? undefined : readString(body.content, false);
  const reveal = body.reveal === undefined ? undefined : readString(body.reveal, false);
  const parentId = readNullableId(body.parent_id);
  if (!isValidCreateInput({ body, content, kind, parentId, reveal, title })) {
    sendAgentControlInvalidRequest(request, response, options, capability);
    return;
  }
  sendMutation(request, response, options, capability, () => ({
    material: kind === 'item'
      ? createAgentControlMaterial({
          content: content as string, kind, parentId: parentId as string | null, reveal: reveal as string
        })
      : createAgentControlMaterial({
          ...(typeof content === 'string' ? { content } : {}),
          kind: kind as 'folder' | 'topic', parentId: parentId as string | null, title: title as string
        })
  }));
}

function isValidCreateInput(args: {
  body: Record<string, unknown>;
  content: string | null | undefined;
  kind: 'folder' | 'item' | 'topic' | null;
  parentId: string | null | undefined;
  reveal: string | null | undefined;
  title: string | null;
}) {
  if (!args.kind || args.parentId === undefined || args.content === null || args.reveal === null) return false;
  if ((args.content?.length ?? 0) > AGENT_CONTROL_MATERIAL_WRITE_CONTENT_LIMIT) return false;
  if ((args.reveal?.length ?? 0) > AGENT_CONTROL_MATERIAL_WRITE_REVEAL_LIMIT) return false;
  if (args.kind === 'item') {
    return args.body.title === undefined && Boolean(args.content?.trim()) && Boolean(args.reveal?.trim());
  }
  return Boolean(args.title) && args.body.reveal === undefined;
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
