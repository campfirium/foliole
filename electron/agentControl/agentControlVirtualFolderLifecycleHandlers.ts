import type http from 'node:http';

import {
  readAuthorizedAgentControlBody,
  recordAgentControlRequest,
  sendAgentControlInvalidRequest,
  sendAgentControlJson
} from './agentControlMutationHandlerSupport.js';
import type { AgentControlRequestHandlerOptions } from './agentControlRequestHandler.js';
import {
  restoreAgentControlVirtualFolder,
  softDeleteAgentControlVirtualFolder,
  updateAgentControlVirtualFolder
} from './agentControlVirtualFolderLifecycle.js';
import { AgentVirtualFolderMutationError } from './agentControlVirtualFolderMutations.js';

export async function handleVirtualFolderUpdate(request: http.IncomingMessage, response: http.ServerResponse, options: AgentControlRequestHandlerOptions) {
  await handleLifecycle(request, response, options, 'virtualFolders.update', (body) => {
    const base = readBase(body);
    const title = body.title === undefined ? undefined : readString(body.title);
    const description = body.description === undefined ? undefined : readString(body.description, false);
    if (!base || (title === undefined && description === undefined) || title === null || description === null) return null;
    return () => updateAgentControlVirtualFolder({ ...base, ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }) });
  });
}

export async function handleVirtualFolderDeleteSoft(request: http.IncomingMessage, response: http.ServerResponse, options: AgentControlRequestHandlerOptions) {
  await handleLifecycle(request, response, options, 'virtualFolders.deleteSoft', (body) => {
    const base = readBase(body);
    return base ? () => softDeleteAgentControlVirtualFolder(base) : null;
  });
}

export async function handleVirtualFolderRestore(request: http.IncomingMessage, response: http.ServerResponse, options: AgentControlRequestHandlerOptions) {
  await handleLifecycle(request, response, options, 'virtualFolders.restore', (body) => {
    const base = readBase(body);
    return base ? () => restoreAgentControlVirtualFolder(base) : null;
  });
}

async function handleLifecycle(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  options: AgentControlRequestHandlerOptions,
  capability: string,
  build: (body: Record<string, unknown>) => (() => Record<string, unknown>) | null
) {
  const body = await readAuthorizedAgentControlBody(request, response, options, capability);
  if (!body) return;
  const mutate = build(body);
  if (!mutate) return sendAgentControlInvalidRequest(request, response, options, capability);
  const targetId = readString(body.id) ?? undefined;
  try {
    const payload = mutate();
    recordAgentControlRequest({ capability, options, request, result: 'success', ...(targetId ? { targetId } : {}) });
    sendAgentControlJson(response, 200, payload);
  } catch (error) {
    if (!(error instanceof AgentVirtualFolderMutationError)) throw error;
    recordAgentControlRequest({ capability, errorCategory: error.category, options, request, result: 'failed', ...(targetId ? { targetId } : {}) });
    sendAgentControlJson(response, error.statusCode, { error: error.category });
  }
}

function readBase(body: Record<string, unknown>) {
  const id = readString(body.id);
  const expectedUpdatedAt = readString(body.expected_updated_at);
  return id && expectedUpdatedAt ? { expectedUpdatedAt, id } : null;
}

function readString(value: unknown, trim = true) {
  if (typeof value !== 'string') return null;
  return trim ? value.trim() || null : value;
}
