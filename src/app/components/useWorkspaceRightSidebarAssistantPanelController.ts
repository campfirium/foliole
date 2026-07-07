import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';

import type {
  NativeAssistantSendMessageResult,
  NativeAssistantThreadIndexRecord,
  NativeAssistantTurnEvent
} from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  listAssistantThreadIndex,
  sendAssistantMessage,
  subscribeAssistantTurnEvents
} from '../../shared/platform/assistantRuntime';

import {
  createFailedMessageAction,
  createPendingMessageAction,
  createReadyMessageAction,
  createStreamingMessageAction,
  createUserMessageAction,
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
  const activeTurnRef = useRef<ActiveTurn | null>(null);
  const activeMessages = messagesByThread[threads.selectedThreadId ?? PENDING_THREAD_KEY] ?? [];
  const selectedRecord = findSelectedRecord(threads.records, threads.selectedThreadId);

  useEffect(
    () =>
      subscribeAssistantTurnEvents((event) =>
        applyAssistantTurnEvent(event, activeTurnRef.current, args.failedText, dispatchCache)
      ),
    [args.failedText]
  );

  return {
    activeMessages,
    handleNewThread: () => threads.selectThreadId(null),
    handleSelectRecord: (record: NativeAssistantThreadIndexRecord) =>
      selectRecord(record, args.nodesById, args.onSelectNode, threads.selectThreadId),
    handleSubmit: createHandleSubmit({
      activeTurnRef,
      dispatchCache,
      failedText: args.failedText,
      location,
      messageText,
      pendingText: args.pendingText,
      sending,
      setMessageText,
      setSending,
      threads
    }),
    loading: threads.loading,
    messageText,
    records: threads.records,
    selectedRecord,
    selectedThreadId: threads.selectedThreadId,
    sending,
    setMessageText
  };
}

function createHandleSubmit(args: SubmitHandlerArgs) {
  return async (event: FormEvent) => {
    event.preventDefault();
    const prompt = args.messageText.trim();
    if (!prompt || args.sending) return;
    args.setMessageText('');
    args.setSending(true);
    const threadKey = args.threads.selectedThreadId ?? PENDING_THREAD_KEY;
    const pendingId = `assistant-${Date.now()}`;
    args.activeTurnRef.current = { clientTurnId: pendingId, threadKey };
    args.dispatchCache(createUserMessageAction(threadKey, pendingId, prompt));
    args.dispatchCache(createPendingMessageAction(threadKey, pendingId, args.pendingText));
    try {
      const result = await sendAssistantTurn(prompt, args.location, args.threads.selectedThreadId, pendingId);
      applySendResult({ ...args, pendingId, prompt, result, threadKey });
    } finally {
      args.activeTurnRef.current = null;
      args.setSending(false);
    }
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

function applySendResult(result: SendResultArgs) {
  const threadId = result.result?.message?.threadId;
  if (result.result?.state === 'ready' && threadId) {
    if (result.threads.selectedThreadId === null)
      result.dispatchCache({ fromKey: PENDING_THREAD_KEY, toKey: threadId, type: 'move' });
    result.dispatchCache(createReadyMessageAction(threadId, result.pendingId, result.result));
    if (result.result.threadIndex) result.threads.upsertRecord(result.result.threadIndex);
    result.threads.selectThreadId(threadId);
    return;
  }
  result.dispatchCache(createFailedMessageAction(result.threadKey, result.pendingId, result.failedText));
  result.setMessageText(result.prompt);
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

async function sendAssistantTurn(message: string, openingLocation: ReturnType<typeof resolveAssistantLocation>, providerThreadId: string | null, clientTurnId: string) {
  return sendAssistantMessage({
    clientTurnId,
    message,
    openingLocation,
    ...(providerThreadId ? { providerThreadId } : {})
  });
}

function applyAssistantTurnEvent(
  event: NativeAssistantTurnEvent,
  activeTurn: ActiveTurn | null,
  failedText: string,
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void
) {
  if (!activeTurn || event.clientTurnId !== activeTurn.clientTurnId) return;
  if (event.kind === 'delta')
    dispatchCache(createStreamingMessageAction(activeTurn.threadKey, activeTurn.clientTurnId, event.text ?? ''));
  if (event.kind === 'failed')
    dispatchCache(createFailedMessageAction(activeTurn.threadKey, activeTurn.clientTurnId, failedText));
}

function selectThreadIdFromRecords(
  current: string | null,
  records: NativeAssistantThreadIndexRecord[]
): string | null {
  if (current && records.some((record) => record.providerThreadId === current)) return current;
  return records[0]?.providerThreadId ?? null;
}

type SendResultArgs = {
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  failedText: string;
  pendingId: string;
  prompt: string;
  result: NativeAssistantSendMessageResult | null;
  setMessageText: (text: string) => void;
  threadKey: string;
  threads: ReturnType<typeof useAssistantThreadRecords>;
};

type ActiveTurn = {
  clientTurnId: string;
  threadKey: string;
};

type SubmitHandlerArgs = {
  activeTurnRef: { current: ActiveTurn | null };
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  failedText: string;
  location: ReturnType<typeof resolveAssistantLocation>;
  messageText: string;
  pendingText: string;
  sending: boolean;
  setMessageText: (text: string) => void;
  setSending: (sending: boolean) => void;
  threads: ReturnType<typeof useAssistantThreadRecords>;
};
