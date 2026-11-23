import { getAgentControlApiSessionDescriptor } from '../agentControl/agentControlServer.js';
import type { AgentControlSessionDescriptor } from '../agentControl/agentControlTypes.js';

import { AIDE_LOCAL_DIVE_TOOLS } from './aideLocalDiveTools.js';
import { AIDE_LOCAL_READ_TOOLS, type AideLocalToolHandler } from './aideLocalReadTools.js';
import { AIDE_SCOPED_READ_TOOLS, isAideMaterialInReach } from './aideReadScope.js';
import { validateAideToolArguments } from './aideToolArguments.js';
import { AIDE_TOOL_REGISTRY, type AideToolDefinition } from './aideToolRegistry.js';
import {
  chargeAideReadResult,
  confirmAideWrites,
  isAideToolOffered,
  type AideToolSession
} from './aideToolSession.js';

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
    allowedCapabilities?: readonly string[];
    descriptor?: AgentControlSessionDescriptor | null;
    fetcher?: typeof fetch;
    localTools?: Record<string, AideLocalToolHandler>;
    onDispatch?: (mutates: boolean) => void;
    session?: AideToolSession;
    signal?: AbortSignal;
    /** Already settled for the batch this call belongs to; otherwise a change asks on its own. */
    writeApproval?: boolean;
  } = {}
): Promise<AideToolCallResult> {
  const definition = AIDE_TOOL_REGISTRY[request.tool];
  const descriptor = options.descriptor === undefined
    ? getAgentControlApiSessionDescriptor()
    : options.descriptor;
  if (!definition || !descriptor) return failure('tool_unavailable');
  if (options.allowedCapabilities
    && !options.allowedCapabilities.includes(definition.capability)) {
    return failure('capability_disabled');
  }
  if (!descriptor.capabilities.includes(definition.capability)) {
    return failure('capability_disabled');
  }
  // The model may still call a tool it saw earlier in the thread; the reply's switches decide.
  if (!isAideToolOffered(options.session, request.tool)) return failure('tool_disabled');
  if (!definition.mutates && options.session && options.session.readUsed >= options.session.readBudget) {
    return readLimitReached(0);
  }
  const body = validateAideToolArguments(request.tool, request.arguments);
  if (!body) return failure('invalid_arguments');
  if (AIDE_SCOPED_READ_TOOLS.has(request.tool) && options.session?.readScope
    && !await isAideMaterialInReach(options.session.readScope, String(body.id))) {
    return outsideReadScope();
  }
  if (definition.mutates && !(options.writeApproval
    ?? await confirmAideWrites(options.session, [{ arguments: body, tool: request.tool }], options.signal))) {
    return writeDeclined();
  }
  const outcome = definition.local
    ? await executeLocal(request.tool, definition.mutates, body, options)
    : await executeRemote(definition, body, descriptor, options);
  if (definition.mutates || !outcome.success) return outcome;
  const charge = chargeAideReadResult(options.session, outcome.contentItems[0]?.text ?? '');
  return charge.ok ? outcome : readLimitReached(charge.remaining);
}

const LOCAL_TOOLS: Record<string, AideLocalToolHandler> = { ...AIDE_LOCAL_READ_TOOLS, ...AIDE_LOCAL_DIVE_TOOLS };

async function executeLocal(
  tool: string,
  mutates: boolean,
  body: Record<string, unknown>,
  options: NonNullable<Parameters<typeof executeAideTool>[1]>
) {
  const handler = options.localTools?.[tool] ?? LOCAL_TOOLS[tool];
  if (!handler) return failure('tool_unavailable');
  try {
    options.onDispatch?.(mutates);
    const outcome = await handler(body);
    return result(outcome.payload, outcome.ok);
  } catch {
    return failure(mutates ? 'write_failed' : 'read_failed');
  }
}

async function executeRemote(
  definition: AideToolDefinition,
  body: Record<string, unknown>,
  descriptor: AgentControlSessionDescriptor,
  options: NonNullable<Parameters<typeof executeAideTool>[1]>
) {
  try {
    options.onDispatch?.(definition.mutates);
    const response = await (options.fetcher ?? fetch)(`${descriptor.endpoint}/agent-control/v1/${definition.path}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        'content-type': 'application/json',
        'x-foliole-agent-id': 'foliole-aide'
      },
      method: 'POST',
      ...(options.signal ? { signal: options.signal } : {})
    });
    const payload = await response.json() as unknown;
    return result(payload, response.ok);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (definition.mutates) throw new Error('tool_write_outcome_uncertain', { cause: error });
    return failure('connection_failed');
  }
}

function readLimitReached(remaining: number) {
  return result({
    error: 'read_limit_reached',
    message: remaining > 0
      ? `This reply's read limit is almost reached; only about ${remaining} tokens remain. Ask for less, or answer with what has been read and say where reading stopped.`
      : "This reply's read limit is reached. Answer with what has been read and say where reading stopped.",
    remaining_tokens: remaining
  }, false);
}

function outsideReadScope() {
  return result({
    error: 'outside_read_scope',
    message: 'This material is not linked to the conversation and the AI permissions do not reach it. Answer from what you can read, or ask the person to link it.'
  }, false);
}

function writeDeclined() {
  return result({
    error: 'write_declined',
    message: 'The person did not allow this change, so nothing was changed. Do not retry it unless they ask.'
  }, false);
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
