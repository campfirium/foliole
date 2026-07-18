import {
  CURRENT_ASSISTANT_AGENT_TOOL_VERSION,
  type NativeAssistantAgentControlContext
} from '../../lib/platform/nativeAssistantContract.js';
import { getAssistantThreadIndex } from '../database/assistantThreadIndex.js';
import { listAssistantThreadMessages } from '../database/assistantThreadMessages.js';

export function prepareAssistantThreadContinuation(
  providerThreadId: string | undefined,
  agentControl: NativeAssistantAgentControlContext
) {
  if (!providerThreadId) return {
    agentToolVersion: resolveAttachedToolVersion(agentControl)
  };
  const record = getAssistantThreadIndex(providerThreadId);
  if (!requiresToolUpgrade(record.agentToolVersion, agentControl)) return {
    agentToolVersion: record.agentToolVersion,
    providerThreadId
  };
  const continuationMessages = listAssistantThreadMessages(providerThreadId);
  if (!continuationMessages.length) throw new Error('assistant_thread_history_unavailable');
  return {
    agentToolVersion: CURRENT_ASSISTANT_AGENT_TOOL_VERSION,
    continuationMessages,
    continuedFromThreadId: providerThreadId
  };
}

function resolveAttachedToolVersion(agentControl: NativeAssistantAgentControlContext) {
  return agentControl.state === 'running' && agentControl.capabilities.length > 0
    ? CURRENT_ASSISTANT_AGENT_TOOL_VERSION
    : 0;
}

function requiresToolUpgrade(
  version: number,
  agentControl: NativeAssistantAgentControlContext
) {
  return version < CURRENT_ASSISTANT_AGENT_TOOL_VERSION
    && agentControl.state === 'running'
    && agentControl.capabilities.length > 0;
}
