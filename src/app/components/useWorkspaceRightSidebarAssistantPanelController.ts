import { useMemo, useReducer, useRef, useState, type FormEvent } from 'react';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantThreadIndexRecord
} from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { sendAssistantMessage } from '../../shared/platform/assistantRuntime';

import { useAssistantTurnEventSubscription, type AssistantActiveTurn } from './useAssistantTurnEventSubscription';
import { useWorkspaceRightSidebarAssistantThreadMessages } from './useWorkspaceRightSidebarAssistantThreadMessages';
import { useWorkspaceRightSidebarAssistantThreads } from './useWorkspaceRightSidebarAssistantThreads';
import type { WorkspaceLayoutDocumentProps } from './workspaceLayoutPropGroups';
import {
  createFailedMessageAction,
  createPendingMessageAction,
  createReadyMessageAction,
  createUserMessageAction,
  messageCacheReducer,
  PENDING_THREAD_KEY,
  resolveAssistantLocation,
  resolveAssistantWorkspaceContextForLocation
} from './workspaceRightSidebarAssistantPanelModel';

type AssistantPanelControllerArgs = {
  activeNodeId: string | null;
  aideReady: boolean;
  editorAdapterRef?: WorkspaceLayoutDocumentProps['editorAdapterRef'] | undefined;
  failedText: string;
  nodesById: Record<string, Node>;
  onCapabilityFailure: (category: NativeAssistantFailureCategory) => void;
  onSelectNode: (nodeId: string) => void;
  pendingText: string;
  topicUnavailableText: string;
};

export function useWorkspaceRightSidebarAssistantPanelController(args: AssistantPanelControllerArgs) {
  const location = useMemo(
    () => resolveAssistantLocation(args.activeNodeId, args.nodesById),
    [args.activeNodeId, args.nodesById]
  );
  const threads = useWorkspaceRightSidebarAssistantThreads(args.aideReady);
  const [messageText, setMessageText] = useState('');
  const [messagesByThread, dispatchCache] = useReducer(messageCacheReducer, {});
  const [sending, setSending] = useState(false);
  const activeTurnRef = useRef<AssistantActiveTurn | null>(null);
  const activeMessages = messagesByThread[threads.selectedThreadId ?? PENDING_THREAD_KEY] ?? [];
  const selectedRecord = findSelectedRecord(threads.records, threads.selectedThreadId);

  const threadMessageStatus = useThreadMessageStatus(dispatchCache, messagesByThread, threads.selectedThreadId);

  useAssistantTurnEventSubscription({
    activeTurnRef,
    dispatchCache,
    failedText: args.failedText,
    onCapabilityFailure: args.onCapabilityFailure,
    setMessageText,
    setSending
  });

  return {
    activeMessages,
    handleRemoveRecord: async (record: NativeAssistantThreadIndexRecord) => {
      if (await threads.removeRecord(record))
        dispatchCache({ key: record.providerThreadId, type: 'delete' });
    },
    handleNewThread: () => { setMessageText(''); threads.selectThreadId(null); },
    handleSelectRecord: (record: NativeAssistantThreadIndexRecord) => selectRecord(record, args.nodesById, args.onSelectNode, threads.selectThreadId),
    handleSubmit: createHandleSubmit({
      activeNodeId: args.activeNodeId,
      aideReady: args.aideReady,
      activeTurnRef,
      dispatchCache,
      editorAdapterRef: args.editorAdapterRef,
      failedText: args.failedText,
      location,
      messageText,
      nodesById: args.nodesById,
      onCapabilityFailure: args.onCapabilityFailure,
      pendingText: args.pendingText,
      selectedRecord,
      sending,
      setMessageText,
      setSending,
      threads
    }),
    loading: threads.loading,
    messageText,
    records: threads.records,
    reloadThreads: threads.reload,
    removingThreadId: threads.removingThreadId,
    threadError: threads.error,
    selectedThreadNotice: getSelectedThreadNotice(selectedRecord, args.nodesById, args.topicUnavailableText),
    selectedRecord,
    selectedThreadId: threads.selectedThreadId,
    sending,
    setMessageText,
    threadMessageStatus
  };
}

function useThreadMessageStatus(
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void,
  messagesByThread: ReturnType<typeof messageCacheReducer>,
  selectedThreadId: string | null
) {
  return useWorkspaceRightSidebarAssistantThreadMessages({
    dispatchCache,
    messagesByThread,
    selectedThreadId
  });
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
      if (args.activeTurnRef.current?.clientTurnId === pendingId)
        applySendResult({ ...args, pendingId, prompt, result, threadKey });
    } catch {
      if (args.activeTurnRef.current?.clientTurnId === pendingId)
        applySendResult({ ...args, pendingId, prompt, result: null, threadKey });
    } finally {
      if (args.activeTurnRef.current?.clientTurnId === pendingId) {
        args.activeTurnRef.current = null;
        args.setSending(false);
      }
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
  const failureCategory = result.result?.failure?.category;
  if (failureCategory) result.onCapabilityFailure(failureCategory);
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
  const openingLocation = args.selectedRecord?.location ?? args.location;
  return sendAssistantMessage({
    clientTurnId,
    message,
    openingLocation,
    workspaceContext: resolveAssistantWorkspaceContextForLocation(
      openingLocation,
      args.activeNodeId,
      args.nodesById,
      args.editorAdapterRef?.current ?? null
    ),
    ...(args.threads.selectedThreadId ? { providerThreadId: args.threads.selectedThreadId } : {})
  });
}

type SendResultArgs = {
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  failedText: string;
  pendingId: string;
  prompt: string;
  result: NativeAssistantSendMessageResult | null;
  onCapabilityFailure: (category: NativeAssistantFailureCategory) => void;
  setMessageText: (text: string) => void;
  threadKey: string;
  threads: ReturnType<typeof useWorkspaceRightSidebarAssistantThreads>;
};

type SubmitHandlerArgs = {
  activeNodeId: string | null;
  aideReady: boolean;
  activeTurnRef: { current: AssistantActiveTurn | null };
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  editorAdapterRef: WorkspaceLayoutDocumentProps['editorAdapterRef'] | undefined;
  failedText: string;
  location: ReturnType<typeof resolveAssistantLocation>;
  messageText: string;
  nodesById: Record<string, Node>;
  onCapabilityFailure: (category: NativeAssistantFailureCategory) => void;
  pendingText: string;
  selectedRecord: NativeAssistantThreadIndexRecord | null;
  sending: boolean;
  setMessageText: (text: string) => void;
  setSending: (sending: boolean) => void;
  threads: ReturnType<typeof useWorkspaceRightSidebarAssistantThreads>;
};
