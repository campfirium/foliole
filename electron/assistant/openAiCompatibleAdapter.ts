import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantThreadMessageRecord,
  NativeAssistantTurnEvent,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';

import type { StoredAssistantImage } from './assistantImageStorage.js';
import { formatToolFreeMaterialProjection } from './assistantMaterialProjection.js';
import { loadFolioleAideByokRuntimeConfig } from './folioleAideByokSettings.js';
import { selectRecentOpenAiCompatibleHistory } from './openAiCompatibleHistory.js';
import { readOpenAiCompatibleSse } from './openAiCompatibleSse.js';

interface OpenAiCompatibleSendInput {
  clientTurnId: string;
  history: NativeAssistantThreadMessageRecord[];
  images: StoredAssistantImage[];
  message: string;
  onEvent?: (event: NativeAssistantTurnEvent) => void;
  providerThreadId?: string;
  workspaceContext?: NativeAssistantWorkspaceContext;
}

export class OpenAiCompatibleAdapter {
  private activeController: AbortController | null = null;

  async sendMessage(input: OpenAiCompatibleSendInput): Promise<NativeAssistantSendMessageResult> {
    if (this.activeController) return failure('busy');
    const message = input.message.trim();
    if (!message) return failure('protocol_error');
    const threadId = input.providerThreadId ?? randomUUID();
    const controller = new AbortController();
    this.activeController = controller;
    try {
      const config = loadFolioleAideByokRuntimeConfig();
      input.onEvent?.(event(input.clientTurnId, 'started', threadId));
      const response = await fetch(config.endpoint, {
        body: JSON.stringify({
          messages: await createMessages(input),
          model: config.model,
          stream: true
        }),
        headers: {
          accept: 'text/event-stream',
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json'
        },
        method: 'POST',
        redirect: 'error',
        signal: controller.signal
      });
      assertSseResponse(response);
      const completion = await readOpenAiCompatibleSse(response.body, controller, (delta) => input.onEvent?.({
        ...event(input.clientTurnId, 'delta', threadId),
        text: delta
      }));
      if (completion.toolCalls.length > 0 || !completion.text.trim()) throw categorized('protocol_error');
      const text = completion.text;
      input.onEvent?.({ ...event(input.clientTurnId, 'completed', threadId), text });
      return {
        message: { text, threadId, turnId: input.clientTurnId },
        provider: 'openai-compatible',
        state: 'ready'
      };
    } catch (error) {
      const category = errorCategory(error);
      input.onEvent?.({
        ...event(input.clientTurnId, 'failed', threadId),
        failure: { category }
      });
      return failure(category);
    } finally {
      if (this.activeController === controller) this.activeController = null;
    }
  }

  dispose() {
    this.abortActive();
    this.activeController = null;
  }

  abortActive() {
    this.activeController?.abort();
  }
}

function assertSseResponse(response: Response): asserts response is Response & { body: ReadableStream<Uint8Array> } {
  if (!response.ok) throw categorized(responseCategory(response.status));
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream') || !response.body) {
    throw categorized('protocol_error');
  }
}

async function createMessages(input: {
  history: NativeAssistantThreadMessageRecord[];
  images: StoredAssistantImage[];
  message: string;
  workspaceContext?: NativeAssistantWorkspaceContext;
}) {
  const material = formatToolFreeMaterialProjection(input.workspaceContext);
  const currentContent = [
    { text: input.message, type: 'text' },
    ...await Promise.all(input.images.map(async (image) => ({
      image_url: { url: `data:${image.mimeType};base64,${(await fs.readFile(image.filePath)).toString('base64')}` },
      type: 'image_url'
    })))
  ];
  return [
    ...(material ? [{ content: material, role: 'system' }] : []),
    ...selectRecentOpenAiCompatibleHistory(input.history)
      .map(({ role, text }) => ({ content: text, role })),
    { content: currentContent, role: 'user' }
  ];
}

function responseCategory(status: number): NativeAssistantFailureCategory {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 429 || (status >= 502 && status <= 504)) return 'overloaded';
  return 'protocol_error';
}

function errorCategory(error: unknown): NativeAssistantFailureCategory {
  if (error && typeof error === 'object' && 'category' in error) {
    return (error as { category: NativeAssistantFailureCategory }).category;
  }
  if (error instanceof Error && (
    error.message === 'byok_not_configured' || error.message === 'secure_storage_unavailable'
  )) return 'not_configured';
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
    return 'interrupted';
  }
  return error instanceof TypeError ? 'protocol_error' : 'internal_error';
}

function categorized(category: NativeAssistantFailureCategory) {
  return Object.assign(new Error(category), { category });
}

function failure(category: NativeAssistantFailureCategory): NativeAssistantSendMessageResult {
  return { failure: { category }, provider: 'openai-compatible', state: 'failed' };
}

function event(
  clientTurnId: string,
  kind: NativeAssistantTurnEvent['kind'],
  providerThreadId: string
): NativeAssistantTurnEvent {
  return { clientTurnId, kind, provider: 'openai-compatible', providerThreadId };
}
