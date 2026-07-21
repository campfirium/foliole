import type { NativeAssistantThreadMessageRecord } from '../../lib/platform/nativeAssistantContract.js';
import type { NativeAssistantImageAttachment } from '../../lib/platform/nativeAssistantImageContract.js';

export type AssistantContinuationMessage = Pick<NativeAssistantThreadMessageRecord, 'role' | 'text'> & {
  images?: Array<NativeAssistantImageAttachment & { contentBase64: string }>;
};

export function createThreadHistoryItems(messages: AssistantContinuationMessage[]) {
  return messages.map((message) => ({
    content: [
      {
        text: message.text,
        type: message.role === 'user' ? 'input_text' : 'output_text'
      },
      ...(message.role === 'user' ? (message.images ?? []).map((image) => ({
        image_url: `data:${image.mimeType};base64,${image.contentBase64}`,
        type: 'input_image'
      })) : [])
    ],
    role: message.role,
    type: 'message'
  }));
}
