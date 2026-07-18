import type { NativeAssistantThreadMessageRecord } from '../../lib/platform/nativeAssistantContract.js';

export type AssistantContinuationMessage = Pick<NativeAssistantThreadMessageRecord, 'role' | 'text'>;

export function createThreadHistoryItems(messages: AssistantContinuationMessage[]) {
  return messages.map((message) => ({
    content: [{
      text: message.text,
      type: message.role === 'user' ? 'input_text' : 'output_text'
    }],
    role: message.role,
    type: 'message'
  }));
}
