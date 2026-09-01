import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';
import type { AgentControlSessionDescriptor } from '../agentControl/agentControlTypes.js';

import {
  aideToolFailure,
  executeAideTool,
  type AideToolCallResult,
  type AideToolRequest
} from './aideToolExecutor.js';
import { AIDE_TOOL_REGISTRY } from './aideToolRegistry.js';
import { readNestedString, type JsonRpcMessage } from './codexAppServerProtocol.js';
import type { TurnState } from './codexAppServerSessionTypes.js';

export type DynamicToolCallResult = AideToolCallResult;
export type FolioleDynamicToolRequest = AideToolRequest;

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
  return aideToolFailure(error);
}

export function createFolioleDynamicTools(capabilities: readonly string[] = []) {
  const enabled = new Set(capabilities);
  const tools = Object.entries(AIDE_TOOL_REGISTRY)
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
  return executeAideTool(request, options);
}
