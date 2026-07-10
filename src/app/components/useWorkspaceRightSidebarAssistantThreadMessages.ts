import { useEffect, useState } from 'react';

import { listAssistantThreadMessages } from '../../shared/platform/assistantRuntime';

import {
  messageCacheReducer,
  threadMessagesToAssistantMessages,
  type MessageCache
} from './workspaceRightSidebarAssistantPanelModel';

export function useWorkspaceRightSidebarAssistantThreadMessages(args: {
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  messagesByThread: MessageCache;
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
    void loadLocalThreadMessages(threadId).then((messages) => {
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
  }, [dispatchCache, messagesByThread, selectedThreadId]);
  return status;
}

async function loadLocalThreadMessages(threadId: string) {
  const records = await listAssistantThreadMessages({ providerThreadId: threadId });
  if (!records) throw new Error('assistant_thread_messages_unavailable');
  return threadMessagesToAssistantMessages(records);
}
