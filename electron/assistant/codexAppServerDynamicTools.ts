import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';
import { getAgentControlApiSessionDescriptor } from '../agentControl/agentControlServer.js';
import type { AgentControlCapability } from '../agentControl/agentControlTypes.js';
import type { AgentControlSessionDescriptor } from '../agentControl/agentControlTypes.js';

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

interface ReadToolDefinition {
  capability: AgentControlCapability;
  description: string;
  inputSchema: Record<string, unknown>;
  path: string;
}

const OBJECT_SCHEMA = { additionalProperties: false, type: 'object' } as const;
const STRING = { type: 'string' } as const;
const LIMIT = { minimum: 1, type: 'integer' } as const;

const READ_TOOLS: Record<string, ReadToolDefinition> = {
  list_folder: {
    capability: 'materials.listChildren',
    description: 'List the direct Topics and Folders in a Foliole Folder or at the workspace root.',
    inputSchema: {
      ...OBJECT_SCHEMA,
      properties: { limit: LIMIT, parent_id: { type: ['string', 'null'] } }
    },
    path: 'materials/list-children'
  },
  list_virtual_folders: {
    capability: 'virtualFolders.list',
    description: 'List Foliole virtual Folders.',
    inputSchema: { ...OBJECT_SCHEMA, properties: { limit: LIMIT } },
    path: 'virtual-folders/list'
  },
  read_material: {
    capability: 'materials.read',
    description: 'Read one Foliole Topic or Folder by id.',
    inputSchema: { ...OBJECT_SCHEMA, properties: { id: STRING }, required: ['id'] },
    path: 'materials/read'
  },
  read_virtual_folder: {
    capability: 'virtualFolders.read',
    description: 'Read one Foliole virtual Folder and its ordered Topics.',
    inputSchema: {
      ...OBJECT_SCHEMA,
      properties: { id: STRING, limit: LIMIT },
      required: ['id']
    },
    path: 'virtual-folders/read'
  },
  search_materials: {
    capability: 'materials.search',
    description: 'Search readable Foliole Topics and Folders.',
    inputSchema: {
      ...OBJECT_SCHEMA,
      properties: { limit: LIMIT, query: STRING },
      required: ['query']
    },
    path: 'materials/search'
  }
};

export function createFolioleDynamicTools(capabilities: readonly string[] = []) {
  const enabled = new Set(capabilities);
  const tools = Object.entries(READ_TOOLS)
    .filter(([, definition]) => enabled.has(definition.capability))
    .map(([name, definition]) => ({
      description: definition.description,
      inputSchema: definition.inputSchema,
      name,
      type: 'function' as const
    }));
  return tools.length === 0 ? [] : [{
    description: 'Read Topics and Folders from the current Foliole workspace.',
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
  const definition = READ_TOOLS[request.tool];
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
  const properties = schema.properties as Record<string, { minimum?: number; type: string | string[] }>;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  if ([...required].some((key) => !(key in value))) return null;
  if (Object.keys(value).some((key) => !properties[key])) return null;
  for (const [key, fieldValue] of Object.entries(value)) {
    const property = properties[key];
    if (!property) return null;
    const types = Array.isArray(property.type) ? property.type : [property.type];
    if (!types.some((type) => matchesType(fieldValue, type, property.minimum))) return null;
  }
  return value;
}

function matchesType(value: unknown, type: string, minimum?: number) {
  if (type === 'null') return value === null;
  if (type === 'string') return typeof value === 'string' && value.trim().length > 0;
  if (type === 'integer') {
    return Number.isInteger(value) && (minimum === undefined || Number(value) >= minimum);
  }
  return false;
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
