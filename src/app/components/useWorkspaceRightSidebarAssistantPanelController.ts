import { useEffect, useMemo, useReducer, useState, type FormEvent } from 'react';

import type {
  NativeAssistantSendMessageResult,
  NativeAssistantThreadIndexRecord
} from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  listAssistantThreadIndex,
  sendAssistantMessage
} from '../../shared/platform/assistantRuntime';

import {
  messageCacheReducer,
  PENDING_THREAD_KEY,
  resolveAssistantLocation,
  upsertRecord
} from './workspaceRightSidebarAssistantPanelModel';

export function useWorkspaceRightSidebarAssistantPanelController(args: {
  activeNodeId: string | null;
  failedText: string;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  pendingText: string;
}) {
  const location = useMemo(
    () => resolveAssistantLocation(args.activeNodeId, args.nodesById),
    [args.activeNodeId, args.nodesById]
  );
  const threads = useAssistantThreadRecords(location);
  const [messageText, setMessageText] = useState('');
  const [messagesByThread, dispatchCache] = useReducer(messageCacheReducer, {});
  const [sending, setSending] = useState(false);
  const activeMessages = messagesByThread[threads.selectedThreadId ?? PENDING_THREAD_KEY] ?? [];
  const selectedRecord = findSelectedRecord(threads.records, threads.selectedThreadId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const prompt = messageText.trim();
    if (!prompt || sending) return;
    setMessageText('');
    setSending(true);
    const threadKey = threads.selectedThreadId ?? PENDING_THREAD_KEY;
    const pendingId = `assistant-${Date.now()}`;
    dispatchCache(createUserMessageAction(threadKey, pendingId, prompt));
    dispatchCache(createPendingMessageAction(threadKey, pendingId, args.pendingText));
    const result = await sendAssistantTurn(prompt, location, threads.selectedThreadId);
    applySendResult({ failedText: args.failedText, pendingId, prompt, result, threadKey });
    setSending(false);
  }

  function applySendResult(result: SendResultArgs) {
    const threadId = result.result?.message?.threadId;
    if (result.result?.state === 'ready' && threadId) {
      if (threads.selectedThreadId === null)
        dispatchCache({ fromKey: PENDING_THREAD_KEY, toKey: threadId, type: 'move' });
      dispatchCache(createReadyMessageAction(threadId, result.pendingId, result.result));
      if (result.result.threadIndex) threads.upsertRecord(result.result.threadIndex);
      threads.selectThreadId(threadId);
      return;
    }
    dispatchCache(createFailedMessageAction(result.threadKey, result.pendingId, result.failedText));
    setMessageText(result.prompt);
  }

  return {
    activeMessages,
    handleNewThread: () => threads.selectThreadId(null),
    handleSelectRecord: (record: NativeAssistantThreadIndexRecord) =>
      selectRecord(record, args.nodesById, args.onSelectNode, threads.selectThreadId),
    handleSubmit,
    loading: threads.loading,
    messageText,
    records: threads.records,
    selectedRecord,
    selectedThreadId: threads.selectedThreadId,
    sending,
    setMessageText
  };
}

function useAssistantThreadRecords(location: ReturnType<typeof resolveAssistantLocation>) {
  const [records, setRecords] = useState<NativeAssistantThreadIndexRecord[]>([]);
  const [selectedThreadId, selectThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void listAssistantThreadIndex({ location }).then((nextRecords) => {
      if (!active) return;
      setRecords(nextRecords ?? []);
      selectThreadId((current) => selectThreadIdFromRecords(current, nextRecords ?? []));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [location]);
  return {
    loading,
    records,
    selectedThreadId,
    selectThreadId,
    upsertRecord: (record: NativeAssistantThreadIndexRecord) =>
      setRecords((current) => upsertRecord(current, record))
  };
}

function selectRecord(
  record: NativeAssistantThreadIndexRecord,
  nodesById: Record<string, Node>,
  onSelectNode: (nodeId: string) => void,
  selectThreadId: (threadId: string | null) => void
) {
  selectThreadId(record.providerThreadId);
  if (record.location.type === 'node' && nodesById[record.location.nodeId])
    onSelectNode(record.location.nodeId);
}

function findSelectedRecord(
  records: NativeAssistantThreadIndexRecord[],
  selectedThreadId: string | null
) {
  return records.find((record) => record.providerThreadId === selectedThreadId) ?? null;
}

async function sendAssistantTurn(
  message: string,
  openingLocation: ReturnType<typeof resolveAssistantLocation>,
  providerThreadId: string | null
) {
  return sendAssistantMessage({
    message,
    openingLocation,
    ...(providerThreadId ? { providerThreadId } : {})
  });
}

function selectThreadIdFromRecords(
  current: string | null,
  records: NativeAssistantThreadIndexRecord[]
): string | null {
  if (current && records.some((record) => record.providerThreadId === current)) return current;
  return records[0]?.providerThreadId ?? null;
}

function createUserMessageAction(key: string, pendingId: string, text: string) {
  return {
    key,
    message: { id: `user-${pendingId}`, role: 'user' as const, state: 'ready' as const, text },
    type: 'append' as const
  };
}

function createPendingMessageAction(key: string, pendingId: string, text: string) {
  return {
    key,
    message: { id: pendingId, role: 'assistant' as const, state: 'pending' as const, text },
    type: 'append' as const
  };
}

function createReadyMessageAction(
  key: string,
  pendingId: string,
  result: NativeAssistantSendMessageResult
) {
  return {
    key,
    message: {
      id: pendingId,
      role: 'assistant' as const,
      state: 'ready' as const,
      text: result.message?.text ?? ''
    },
    messageId: pendingId,
    type: 'replace' as const
  };
}

function createFailedMessageAction(key: string, pendingId: string, text: string) {
  return {
    key,
    message: { id: pendingId, role: 'assistant' as const, state: 'failed' as const, text },
    messageId: pendingId,
    type: 'replace' as const
  };
}

type SendResultArgs = {
  failedText: string;
  pendingId: string;
  prompt: string;
  result: NativeAssistantSendMessageResult | null;
  threadKey: string;
};
