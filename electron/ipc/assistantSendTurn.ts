import type { WebContents } from 'electron';

import type {
  NativeAssistantAgentControlContext,
  NativeAssistantModelSelection,
  NativeAssistantProviderId,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';
import type { StoredAssistantImage } from '../assistant/assistantImageStorage.js';
import type { CodexAppServerAdapter } from '../assistant/codexAppServerAdapter.js';
import type { OpenAiCompatibleAdapter } from '../assistant/openAiCompatibleAdapter.js';

import type { prepareAssistantThreadContinuation } from './assistantThreadContinuation.js';

export async function sendAssistantTurn(input: {
  adapter: CodexAppServerAdapter | null;
  byokAdapter: OpenAiCompatibleAdapter;
  agentControl: NativeAssistantAgentControlContext;
  clientTurnId: string;
  continuation: Awaited<ReturnType<typeof prepareAssistantThreadContinuation>>;
  images: StoredAssistantImage[];
  message: string;
  modelSelection?: NativeAssistantModelSelection;
  onEvent?: (event: NativeAssistantTurnEvent) => void;
  provider: NativeAssistantProviderId;
  sender?: WebContents;
  workspaceContext?: NativeAssistantWorkspaceContext;
}) {
  try {
    if (input.provider === 'openai-compatible') {
      return await sendByokTurn(input);
    }
    if (!input.adapter) return null;
    return await input.adapter.sendMessage({
      clientTurnId: input.clientTurnId,
      ...(input.images.length ? { imagePaths: input.images.map((image) => image.filePath) } : {}),
      message: input.message,
      ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
      ...(input.onEvent ? { onEvent: input.onEvent } : {}),
      ...(input.continuation.continuationMessages
        ? { continuationMessages: input.continuation.continuationMessages }
        : {}),
      ...(input.continuation.providerThreadId
        ? { providerThreadId: input.continuation.providerThreadId }
        : {}),
      workspaceContext: input.workspaceContext
        ? { ...input.workspaceContext, agentControl: input.agentControl }
        : { agentControl: input.agentControl, schemaVersion: 1, scope: 'workspace' }
    });
  } catch {
    return null;
  }
}

async function sendByokTurn(input: Parameters<typeof sendAssistantTurn>[0]) {
  const abort = () => input.byokAdapter.abortActive();
  input.sender?.once('destroyed', abort);
  try {
    return await input.byokAdapter.sendMessage({
      clientTurnId: input.clientTurnId,
      history: input.continuation.persistedContinuationMessages ?? [],
      images: input.images,
      message: input.message,
      ...(input.onEvent ? { onEvent: input.onEvent } : {}),
      ...(input.continuation.providerThreadId
        ? { providerThreadId: input.continuation.providerThreadId }
        : {}),
      workspaceContext: input.workspaceContext
        ? { ...input.workspaceContext, agentControl: input.agentControl }
        : { agentControl: input.agentControl, schemaVersion: 1, scope: 'workspace' }
    });
  } finally {
    input.sender?.removeListener('destroyed', abort);
  }
}
