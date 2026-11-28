import { AGENT_CONTROL_LIBRARY_GENERATION_HEADER, matchesAgentControlLibraryGeneration } from '../agentControl/agentControlLibraryGuard.js';
import { AGENT_CONTROL_JSON_BODY_LIMIT_BYTES } from '../agentControl/agentControlRequestBody.js';
import { getAgentControlApiSessionDescriptor } from '../agentControl/agentControlServer.js';
import type { AgentControlSessionDescriptor } from '../agentControl/agentControlTypes.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { AIDE_LOCAL_DIVE_TOOLS } from './aideLocalDiveTools.js';
import { AIDE_LOCAL_EXTERNAL_TOOLS } from './aideLocalExternalTools.js';
import { AIDE_LOCAL_READ_TOOLS, type AideLocalToolHandler } from './aideLocalReadTools.js';
import { checkAideReadTarget, filterAideReadResult, type AideReadScope } from './aideReadScope.js';
import { searchAideMaterials } from './aideScopedMaterialSearch.js';
import { describeAideArgumentProblem, validateAideToolArguments } from './aideToolArguments.js';
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
  if (!body) return invalidArguments(request);
  const readScope = definition.mutates ? undefined : options.session?.readScope;
  if (readScope && await checkAideReadTarget(readScope, request.tool, body)) return outsideReadScope();
  if (definition.mutates) return executeWrite(request.tool, definition, body, descriptor, options);
  const scopedSearch = request.tool === 'search_materials' ? readScope : undefined;
  const raw = scopedSearch
    ? await executeScopedSearch(scopedSearch, body, options)
    : await executeRead(request.tool, definition, body, descriptor, options);
  if (!raw.success) return raw;
  const outcome = readScope && !scopedSearch ? await filterReadResult(readScope, request.tool, raw) : raw;
  const charge = chargeAideReadResult(options.session, outcome.contentItems[0]?.text ?? '');
  return charge.ok ? outcome : readLimitReached(charge.remaining);
}

function executeRead(
  tool: string,
  definition: AideToolDefinition,
  body: Record<string, unknown>,
  descriptor: AgentControlSessionDescriptor,
  options: NonNullable<Parameters<typeof executeAideTool>[1]>
) {
  return definition.local ? executeLocal(tool, false, body, options) : executeRemote(definition, body, descriptor, options);
}

async function executeScopedSearch(
  scope: AideReadScope,
  body: Record<string, unknown>,
  options: NonNullable<Parameters<typeof executeAideTool>[1]>
) {
  try {
    options.onDispatch?.(false);
    options.signal?.throwIfAborted();
    if (Buffer.byteLength(JSON.stringify(body)) > AGENT_CONTROL_JSON_BODY_LIMIT_BYTES) {
      return failure('request_body_too_large');
    }
    return result(await searchAideMaterials(scope, body, options.signal), true);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return failure('read_failed');
  }
}

async function executeWrite(
  tool: string,
  definition: AideToolDefinition,
  body: Record<string, unknown>,
  descriptor: AgentControlSessionDescriptor,
  options: NonNullable<Parameters<typeof executeAideTool>[1]>
) {
  const generation = options.session?.writeLibraryGeneration;
  if (!matchesAgentControlLibraryGeneration(generation)) return failure('library_changed');
  const approved = options.writeApproval
    ?? await confirmAideWrites(options.session, [{ arguments: body, tool }], options.signal);
  if (!matchesAgentControlLibraryGeneration(generation)) return failure('library_changed');
  if (!approved) return writeDeclined();
  if (!definition.local) return executeRemote(definition, body, descriptor, options, generation);

  const dispatch = () => matchesAgentControlLibraryGeneration(generation)
    ? executeLocal(tool, true, body, options)
    : failure('library_changed');
  return generation === undefined ? dispatch() : runWithDatabaseConnectionOwner(dispatch);
}

const LOCAL_TOOLS: Record<string, AideLocalToolHandler> = { ...AIDE_LOCAL_READ_TOOLS, ...AIDE_LOCAL_DIVE_TOOLS, ...AIDE_LOCAL_EXTERNAL_TOOLS };

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
  options: NonNullable<Parameters<typeof executeAideTool>[1]>,
  generation?: string
) {
  try {
    options.onDispatch?.(definition.mutates);
    const response = await (options.fetcher ?? fetch)(`${descriptor.endpoint}/agent-control/v1/${definition.path}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        'content-type': 'application/json',
        'x-foliole-agent-id': 'foliole-aide',
        ...(generation !== undefined ? { [AGENT_CONTROL_LIBRARY_GENERATION_HEADER]: generation } : {})
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

function invalidArguments(request: AideToolRequest) {
  return result({ error: 'invalid_arguments', ...describeAideArgumentProblem(request.tool, request.arguments) }, false);
}

function outsideReadScope() {
  return result({
    error: 'outside_read_scope',
    message: 'The AI permissions do not let you read this place. Answer from what you can read, or ask the person to change the AI permissions.'
  }, false);
}

async function filterReadResult(scope: AideReadScope, tool: string, outcome: AideToolCallResult) {
  try {
    const payload = JSON.parse(outcome.contentItems[0]?.text ?? 'null') as unknown;
    const filtered = await filterAideReadResult(scope, tool, payload);
    return filtered === payload ? outcome : result(filtered, true);
  } catch {
    return outcome;
  }
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
