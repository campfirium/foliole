import { useMemo, useReducer, useRef, useState, type FormEvent } from 'react';

import type {
  NativeAssistantSendMessageResult,
  NativeAssistantThreadIndexRecord
} from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { sendAssistantMessage } from '../../shared/platform/assistantRuntime';

import { useAssistantTurnEventSubscription, type AssistantActiveTurn } from './useAssistantTurnEventSubscription';
import { useWorkspaceRightSidebarAssistantThreads } from './useWorkspaceRightSidebarAssistantThreads';
import {
  createFailedMessageAction,
  createPendingMessageAction,
  createReadyMessageAction,
  createUserMessageAction,
  messageCacheReducer,
  PENDING_THREAD_KEY,
  resolveAssistantLocation,
  resolveAssistantWorkspaceContext
} from './workspaceRightSidebarAssistantPanelModel';

type AssistantPanelControllerArgs = {
  activeNodeId: string | null;
  aideReady: boolean;
  failedText: string;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  pendingText: string;
  topicUnavailableText: string;
};

export function useWorkspaceRightSidebarAssistantPanelController(args: AssistantPanelControllerArgs) {
  const location = useMemo(
    () => resolveAssistantLocation(args.activeNodeId, args.nodesById),
    [args.activeNodeId, args.nodesById]
  );
  const workspaceContext = useMemo(
    () => resolveAssistantWorkspaceContext(args.activeNodeId, args.nodesById),
    [args.activeNodeId, args.nodesById]
  );
  const threads = useWorkspaceRightSidebarAssistantThreads(location, args.aideReady);
  const [messageText, setMessageText] = useState('');
  const [messagesByThread, dispatchCache] = useReducer(messageCacheReducer, {});
  const [sending, setSending] = useState(false);
  const activeTurnRef = useRef<AssistantActiveTurn | null>(null);
  const activeMessages = messagesByThread[threads.selectedThreadId ?? PENDING_THREAD_KEY] ?? [];
  const selectedRecord = findSelectedRecord(threads.records, threads.selectedThreadId);

  useAssistantTurnEventSubscription({
    activeTurnRef,
    dispatchCache,
    failedText: args.failedText,
    setMessageText,
    setSending
  });

  return {
    activeMessages,
    handleRemoveRecord: threads.deleteRecord,
    handleNewThread: () => {
      setMessageText('');
      threads.selectThreadId(null);
    },
    handleSelectRecord: (record: NativeAssistantThreadIndexRecord) =>
      selectRecord(record, args.nodesById, args.onSelectNode, threads.selectThreadId),
    handleSubmit: createHandleSubmit({
      aideReady: args.aideReady,
      activeTurnRef,
      dispatchCache,
      failedText: args.failedText,
      location,
      messageText,
      pendingText: args.pendingText,
      sending,
      setMessageText,
      setSending,
      threads,
      workspaceContext
    }),
    loading: threads.loading,
    messageText,
    records: threads.records,
    removingThreadId: threads.removingThreadId,
    selectedThreadNotice: getSelectedThreadNotice(selectedRecord, args.nodesById, args.topicUnavailableText),
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
    if (!args.aideReady || !prompt || args.sending) return;
    args.setMessageText('');
    args.setSending(true);
    const threadKey = args.threads.selectedThreadId ?? PENDING_THREAD_KEY;
    const pendingId = `assistant-${Date.now()}`;
    args.activeTurnRef.current = { clientTurnId: pendingId, prompt, threadKey };
    args.dispatchCache(createUserMessageAction(threadKey, pendingId, prompt));
    args.dispatchCache(createPendingMessageAction(threadKey, pendingId, args.pendingText));
    try {
      const result = await sendAssistantTurn(args, pendingId, prompt);
      applySendResult({ ...args, pendingId, prompt, result, threadKey });
    } finally {
      args.activeTurnRef.current = null;
      args.setSending(false);
    }
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

function getSelectedThreadNotice(
  record: NativeAssistantThreadIndexRecord | null,
  nodesById: Record<string, Node>,
  unavailableText: string
) {
  return record?.location.type === 'node' && !nodesById[record.location.nodeId]
    ? unavailableText
    : null;
}

async function sendAssistantTurn(args: SubmitHandlerArgs, clientTurnId: string, message: string) {
  return sendAssistantMessage({
    clientTurnId,
    message,
    openingLocation: args.location,
    workspaceContext: args.workspaceContext,
    ...(args.threads.selectedThreadId ? { providerThreadId: args.threads.selectedThreadId } : {})
  });
}

type SendResultArgs = {
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  failedText: string;
  pendingId: string;
  prompt: string;
  result: NativeAssistantSendMessageResult | null;
  setMessageText: (text: string) => void;
  threadKey: string;
  threads: ReturnType<typeof useWorkspaceRightSidebarAssistantThreads>;
};

type SubmitHandlerArgs = {
  aideReady: boolean;
  activeTurnRef: { current: AssistantActiveTurn | null };
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  failedText: string;
  location: ReturnType<typeof resolveAssistantLocation>;
  messageText: string;
  pendingText: string;
  sending: boolean;
  setMessageText: (text: string) => void;
  setSending: (sending: boolean) => void;
  threads: ReturnType<typeof useWorkspaceRightSidebarAssistantThreads>;
  workspaceContext: ReturnType<typeof resolveAssistantWorkspaceContext>;
};
