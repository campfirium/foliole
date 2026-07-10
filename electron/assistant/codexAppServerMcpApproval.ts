import { readNestedString, type JsonRpcMessage, type JsonRpcRecord } from './codexAppServerProtocol.js';

const FOLIOLE_MCP_SERVER = 'foliole_agent_control';
const FOLIOLE_READ_TOOLS = new Set([
  'foliole_capabilities',
  'foliole_health',
  'foliole_materials_list_children',
  'foliole_materials_read',
  'foliole_materials_search',
  'foliole_virtual_folders_list',
  'foliole_virtual_folders_read'
]);

export class CodexAppServerMcpApprovalPolicy {
  private readonly pendingTools = new Map<string, string>();

  observe(message: JsonRpcMessage): JsonRpcMessage | null {
    if (message.method === 'item/started') this.trackToolCall(message.params);
    if (message.method === 'turn/completed') this.clearTurn(message.params);
    if (message.method !== 'mcpServer/elicitation/request' || message.id === undefined) return null;
    return {
      id: message.id,
      result: this.shouldAccept(message.params)
        ? { action: 'accept', content: {} }
        : { action: 'decline', content: null }
    };
  }

  private trackToolCall(params: JsonRpcRecord | undefined) {
    const itemType = readNestedString(params, ['item', 'type']);
    const server = readNestedString(params, ['item', 'server']);
    const tool = readNestedString(params, ['item', 'tool']);
    const key = turnKey(params);
    if (itemType === 'mcpToolCall' && server === FOLIOLE_MCP_SERVER && tool && key) {
      this.pendingTools.set(key, tool);
    }
  }

  private clearTurn(params: JsonRpcRecord | undefined) {
    const key = turnKey(params);
    if (key) this.pendingTools.delete(key);
  }

  private shouldAccept(params: JsonRpcRecord | undefined) {
    const key = turnKey(params);
    const mode = readNestedString(params, ['mode']);
    const server = readNestedString(params, ['serverName']);
    const required = readRequiredFields(params);
    const tool = key ? this.pendingTools.get(key) : undefined;
    return server === FOLIOLE_MCP_SERVER &&
      (mode === 'form' || mode === 'openai/form') &&
      required.length === 0 &&
      Boolean(tool && FOLIOLE_READ_TOOLS.has(tool));
  }
}

function turnKey(params: JsonRpcRecord | undefined) {
  const threadId = readNestedString(params, ['threadId']);
  const turnId = readNestedString(params, ['turnId']);
  return threadId && turnId ? `${threadId}:${turnId}` : null;
}

function readRequiredFields(params: JsonRpcRecord | undefined) {
  const schema = params?.requestedSchema;
  if (!schema || typeof schema !== 'object') return [];
  const required = (schema as JsonRpcRecord).required;
  return Array.isArray(required) ? required : [];
}
