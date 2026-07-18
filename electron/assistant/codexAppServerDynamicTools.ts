import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';
import { getAgentControlApiSessionDescriptor } from '../agentControl/agentControlServer.js';
import type { AgentControlSessionDescriptor } from '../agentControl/agentControlTypes.js';

import { FOLIOLE_DYNAMIC_TOOLS } from './codexAppServerDynamicToolDefinitions.js';
import { readNestedString, type JsonRpcMessage } from './codexAppServerProtocol.js';
import type { TurnState } from './codexAppServerSessionTypes.js';

export interface DynamicToolCallResult {
  contentItems: Array<{ text: string; type: 'inputText' }>;
  success: boolean;
}

export interface FolioleDynamicToolRequest {
  arguments: unknown;
  tool: string;
}

export function resolveDynamicToolCapabilities(context?: NativeAssistantWorkspaceContext) {
  return context?.agentControl?.state === 'running' ? [...context.agentControl.capabilities] : [];
}

export function readDynamicToolRequest(
  message: JsonRpcMessage,
  turn: TurnState
): FolioleDynamicToolRequest | null {
  const namespace = readNestedString(message.params, ['namespace']);
  const threadId = readNestedString(message.params, ['threadId']);
  const turnId = readNestedString(message.params, ['turnId']);
  const tool = readNestedString(message.params, ['tool']);
  if (namespace !== 'foliole' || !tool || threadId !== turn.threadId || turnId !== turn.turnId) return null;
  return { arguments: message.params?.arguments, tool };
}

export function dynamicToolFailure(error: string): DynamicToolCallResult {
  return result({ error }, false);
}

export function createFolioleDynamicTools(capabilities: readonly string[] = []) {
  const enabled = new Set(capabilities);
  const tools = Object.entries(FOLIOLE_DYNAMIC_TOOLS)
    .filter(([, definition]) => enabled.has(definition.capability))
    .map(([name, definition]) => ({
      description: definition.description,
      inputSchema: definition.inputSchema,
      name,
      type: 'function' as const
    }));
  return tools.length === 0 ? [] : [{
    description: 'Read and update Topics and Folders in the current Foliole workspace.',
    name: 'foliole',
    tools,
    type: 'namespace' as const
  }];
}

export async function executeFolioleDynamicTool(
  request: FolioleDynamicToolRequest,
  options: {
    descriptor?: AgentControlSessionDescriptor | null;
    fetcher?: typeof fetch;
  } = {}
): Promise<DynamicToolCallResult> {
  const definition = FOLIOLE_DYNAMIC_TOOLS[request.tool];
  const descriptor = options.descriptor === undefined
    ? getAgentControlApiSessionDescriptor()
    : options.descriptor;
  if (!definition || !descriptor) return failure('tool_unavailable');
  if (!descriptor.capabilities.includes(definition.capability)) {
    return failure('capability_disabled');
  }
  const body = validateArguments(request.arguments, definition.inputSchema);
  if (!body) return failure('invalid_arguments');
  try {
    const response = await (options.fetcher ?? fetch)(`${descriptor.endpoint}/agent-control/v1/${definition.path}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        'content-type': 'application/json',
        'x-foliole-agent-id': 'foliole-aide'
      },
      method: 'POST'
    });
    const payload = await response.json() as unknown;
    return result(payload, response.ok);
  } catch {
    return failure('connection_failed');
  }
}

function validateArguments(value: unknown, schema: Record<string, unknown>) {
  if (!isRecord(value)) return null;
  const properties = schema.properties as Record<string, JsonSchemaProperty>;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  if ([...required].some((key) => !(key in value))) return null;
  const anyOf = schema.anyOf as Array<{ required: string[] }> | undefined;
  if (anyOf && !anyOf.some((option) => option.required.every((key) => key in value))) return null;
  if (Object.keys(value).some((key) => !properties[key])) return null;
  for (const [key, fieldValue] of Object.entries(value)) {
    const property = properties[key];
    if (!property) return null;
    const types = Array.isArray(property.type) ? property.type : [property.type];
    if (!types.some((type) => matchesType(fieldValue, type, property))) return null;
  }
  return value;
}

interface JsonSchemaProperty {
  enum?: unknown[];
  items?: JsonSchemaProperty;
  minimum?: number;
  minItems?: number;
  minLength?: number;
  type: string | string[];
  uniqueItems?: boolean;
}

function matchesType(value: unknown, type: string, property: JsonSchemaProperty): boolean {
  if (type === 'null') return value === null;
  if (type === 'string') {
    if (typeof value !== 'string') return false;
    const normalized = property.minLength ? value.trim() : value;
    return normalized.length >= (property.minLength ?? 0)
      && (!property.enum || property.enum.includes(value));
  }
  if (type === 'integer') {
    return Number.isInteger(value) && (property.minimum === undefined || Number(value) >= property.minimum);
  }
  if (type === 'array') return matchesArray(value, property);
  return false;
}

function matchesArray(value: unknown, property: JsonSchemaProperty): boolean {
  if (!Array.isArray(value) || value.length < (property.minItems ?? 0)) return false;
  if (property.uniqueItems && new Set(value).size !== value.length) return false;
  return !property.items || value.every((item) => {
    const types = Array.isArray(property.items?.type) ? property.items.type : [property.items?.type];
    return types.some((type) => type && matchesType(item, type, property.items as JsonSchemaProperty));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function result(payload: unknown, success: boolean): DynamicToolCallResult {
  return {
    contentItems: [{ text: JSON.stringify(payload), type: 'inputText' }],
    success
  };
}

function failure(error: string) {
  return dynamicToolFailure(error);
}
