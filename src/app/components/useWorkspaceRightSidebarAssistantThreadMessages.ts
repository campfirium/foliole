import { useEffect, useState } from 'react';

import {
  listAssistantThreadMessages,
  loadAssistantImageAttachment
} from '../../shared/platform/assistantRuntime';

import { threadMessagesToAssistantMessages } from './workspaceRightSidebarAssistantMessageModel';
import {
  messageCacheReducer,
  type MessageCache
} from './workspaceRightSidebarAssistantPanelModel';

export function useWorkspaceRightSidebarAssistantThreadMessages(args: {
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  messagesByThread: MessageCache;
  provider?: import('../../../lib/platform/nativeAssistantContract').NativeAssistantProviderId;
  selectedThreadId: string | null;
}) {
  const { dispatchCache, messagesByThread, selectedThreadId } = args;
  const [status, setStatus] = useState<'failed' | 'idle' | 'loading' | 'ready'>('idle');
  useEffect(() => {
    const threadId = selectedThreadId;
    if (!threadId) {
      setStatus('idle');
      return;
    }
    if (messagesByThread[threadId]?.length) {
      setStatus('ready');
      return;
    }
    let active = true;
    setStatus('loading');
    if (!args.provider) {
      setStatus('failed');
      return;
    }
    void loadLocalThreadMessages(args.provider, threadId).then((messages) => {
      if (!active) return;
      setStatus('ready');
      if (messages.length === 0) return;
      dispatchCache({ key: threadId, messages, type: 'set' });
    }).catch(() => {
      if (active) setStatus('failed');
    });
    return () => {
      active = false;
    };
  }, [args.provider, dispatchCache, messagesByThread, selectedThreadId]);
  return status;
}

async function loadLocalThreadMessages(
  provider: import('../../../lib/platform/nativeAssistantContract').NativeAssistantProviderId,
  threadId: string
) {
  const records = await listAssistantThreadMessages({ provider, providerThreadId: threadId });
  if (!records) throw new Error('assistant_thread_messages_unavailable');
  const messages = threadMessagesToAssistantMessages(records);
  await Promise.all(records.map(async (record, index) => {
    if (!record.images?.length) return;
    const message = messages[index];
    if (!message) throw new Error('assistant_thread_message_unavailable');
    message.images = await Promise.all(record.images.map(async (image) => {
      const content = await loadAssistantImageAttachment(image.id);
      if (!content || content.status !== 'ready') throw new Error('assistant_thread_image_unavailable');
      return { ...image, contentBase64: content.contentBase64 };
    }));
  }));
  return messages;
}
