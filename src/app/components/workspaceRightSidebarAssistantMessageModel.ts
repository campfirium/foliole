import type { NativeAssistantThreadMessageRecord } from '../../../lib/platform/nativeAssistantContract';
import type { NativeAssistantImageDraft } from '../../../lib/platform/nativeAssistantImageContract';

export interface AssistantMessage {
  activity?: 'thinking';
  createdAt?: string;
  failureText?: string;
  id: string;
  images?: NativeAssistantImageDraft[];
  role: 'assistant' | 'user';
  state?: 'failed' | 'pending' | 'ready';
  text: string;
}

export function threadMessagesToAssistantMessages(
  records: NativeAssistantThreadMessageRecord[]
): AssistantMessage[] {
  return records.map((record) => ({
    createdAt: record.createdAt,
    id: record.id,
    role: record.role,
    state: 'ready',
    text: record.text
  }));
}
