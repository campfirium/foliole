import {
  CURRENT_ASSISTANT_AGENT_TOOL_VERSION,
  type NativeAssistantAgentControlContext,
  type NativeAssistantProviderId
} from '../../lib/platform/nativeAssistantContract.js';
import { readAssistantImageContent } from '../assistant/assistantImageStorage.js';
import type { AssistantContinuationMessage } from '../assistant/codexAppServerThreadHistory.js';
import { getAssistantThreadIndex } from '../database/assistantThreadIndex.js';
import { listAssistantThreadMessages } from '../database/assistantThreadMessages.js';

export type PreparedAssistantThreadContinuation = {
  agentToolVersion: number;
  continuationMessages?: AssistantContinuationMessage[];
  continuedFromThreadId?: string;
  persistedContinuationMessages?: ReturnType<typeof listAssistantThreadMessages>;
  provider: NativeAssistantProviderId;
  providerThreadId?: string;
};

export async function prepareAssistantThreadContinuation(
  provider: NativeAssistantProviderId,
  providerThreadId: string | undefined,
  agentControl: NativeAssistantAgentControlContext
): Promise<PreparedAssistantThreadContinuation> {
  if (!providerThreadId) return {
    agentToolVersion: provider === 'codex-app-server' ? resolveAttachedToolVersion(agentControl) : 0,
    provider
  };
  const record = getAssistantThreadIndex(provider, providerThreadId);
  if (provider === 'openai-compatible') return {
    agentToolVersion: 0,
    persistedContinuationMessages: listAssistantThreadMessages(provider, providerThreadId),
    provider,
    providerThreadId
  };
  if (!requiresToolUpgrade(record.agentToolVersion, agentControl)) return {
    agentToolVersion: record.agentToolVersion,
    provider,
    providerThreadId
  };
  const persistedContinuationMessages = listAssistantThreadMessages(provider, providerThreadId);
  if (!persistedContinuationMessages.length) throw new Error('assistant_thread_history_unavailable');
  const continuationMessages = await hydrateContinuationImages(persistedContinuationMessages);
  return {
    agentToolVersion: CURRENT_ASSISTANT_AGENT_TOOL_VERSION,
    continuationMessages,
    continuedFromThreadId: providerThreadId,
    persistedContinuationMessages,
    provider
  };
}

async function hydrateContinuationImages(
  messages: ReturnType<typeof listAssistantThreadMessages>
): Promise<AssistantContinuationMessage[]> {
  return Promise.all(messages.map(async (message) => {
    if (!message.images?.length) return { role: message.role, text: message.text };
    const images = await Promise.all(message.images.map(async (image) => {
      const content = await readAssistantImageContent(image.id);
      if (content.status !== 'ready') throw new Error('assistant_thread_image_unavailable');
      return { ...image, contentBase64: content.contentBase64 };
    }));
    return { images, role: message.role, text: message.text };
  }));
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
