import { getAgentControlApiSessionDescriptor } from '../agentControl/agentControlServer.js';
import type { AgentControlSessionDescriptor } from '../agentControl/agentControlTypes.js';

import { validateAideToolArguments } from './aideToolArguments.js';
import { AIDE_TOOL_REGISTRY } from './aideToolRegistry.js';

export interface AideToolCallResult {
  contentItems: Array<{ text: string; type: 'inputText' }>;
  success: boolean;
}

export interface AideToolRequest {
  arguments: unknown;
  tool: string;
}

export async function executeAideTool(
  request: AideToolRequest,
  options: {
    descriptor?: AgentControlSessionDescriptor | null;
    fetcher?: typeof fetch;
  } = {}
): Promise<AideToolCallResult> {
  const definition = AIDE_TOOL_REGISTRY[request.tool];
  const descriptor = options.descriptor === undefined
    ? getAgentControlApiSessionDescriptor()
    : options.descriptor;
  if (!definition || !descriptor) return failure('tool_unavailable');
  if (!descriptor.capabilities.includes(definition.capability)) {
    return failure('capability_disabled');
  }
  const body = validateAideToolArguments(request.tool, request.arguments);
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

export function aideToolFailure(error: string): AideToolCallResult {
  return result({ error }, false);
}

function result(payload: unknown, success: boolean): AideToolCallResult {
  return {
    contentItems: [{ text: JSON.stringify(payload), type: 'inputText' }],
    success
  };
}

function failure(error: string) {
  return aideToolFailure(error);
}
