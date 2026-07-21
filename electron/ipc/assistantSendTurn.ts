import type {
  NativeAssistantAgentControlContext,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';
import type { StoredAssistantImage } from '../assistant/assistantImageStorage.js';
import type { CodexAppServerAdapter } from '../assistant/codexAppServerAdapter.js';

import type { prepareAssistantThreadContinuation } from './assistantThreadContinuation.js';

export async function sendAssistantTurn(input: {
  adapter: CodexAppServerAdapter;
  agentControl: NativeAssistantAgentControlContext;
  clientTurnId: string;
  continuation: Awaited<ReturnType<typeof prepareAssistantThreadContinuation>>;
  images: StoredAssistantImage[];
  message: string;
  onEvent?: (event: NativeAssistantTurnEvent) => void;
  workspaceContext?: NativeAssistantWorkspaceContext;
}) {
  try {
    return await input.adapter.sendMessage({
      clientTurnId: input.clientTurnId,
      ...(input.images.length ? { imagePaths: input.images.map((image) => image.filePath) } : {}),
      message: input.message,
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
