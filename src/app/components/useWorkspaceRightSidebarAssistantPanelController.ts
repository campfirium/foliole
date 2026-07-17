import { useMemo, useReducer, useRef, useState } from 'react';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantThreadIndexRecord,
  NativeAssistantWorkspaceContext
} from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { useAssistantTurnEventSubscription, type AssistantActiveTurn } from './useAssistantTurnEventSubscription';
import { useFolioleAideContextFollow } from './useFolioleAideContextFollow';
import { useWorkspaceRightSidebarAssistantThreadMessages } from './useWorkspaceRightSidebarAssistantThreadMessages';
import { useWorkspaceRightSidebarAssistantThreads } from './useWorkspaceRightSidebarAssistantThreads';
import type { WorkspaceLayoutDocumentProps } from './workspaceLayoutPropGroups';
import { resetPendingAssistantConversation } from './workspaceRightSidebarAssistantConversationReset';
import {
  messageCacheReducer,
  PENDING_THREAD_KEY,
  resolveAssistantLocation
} from './workspaceRightSidebarAssistantPanelModel';
import { createAssistantSubmitHandler } from './workspaceRightSidebarAssistantSubmitHandler';

type AssistantPanelControllerArgs = {
  activeNodeId: string | null;
  aideReady: boolean;
  editorAdapterRef?: WorkspaceLayoutDocumentProps['editorAdapterRef'] | undefined;
  failedText: string;
  nodesById: Record<string, Node>;
  onCapabilityFailure: (category: NativeAssistantFailureCategory) => void;
  onSelectNode: (nodeId: string) => void;
  topicUnavailableText: string;
  workspaceContextOverride?: NativeAssistantWorkspaceContext | undefined;
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
  const [followCurrentMaterial, setFollowCurrentMaterial] = useFolioleAideContextFollow();
  const activeTurnRef = useRef<AssistantActiveTurn | null>(null);
  const activeMessages = messagesByThread[threads.selectedThreadId ?? PENDING_THREAD_KEY] ?? [];
  const selectedRecord = findSelectedRecord(threads.records, threads.selectedThreadId);
  const threadMessageStatus = useThreadMessageStatus(dispatchCache, messagesByThread, threads.selectedThreadId);

  useAssistantTurnEventSubscription({
    activeTurnRef,
    dispatchCache,
    failedText: args.failedText,
    onCapabilityFailure: args.onCapabilityFailure,
    onProviderThreadStarted: threads.selectThreadId,
    setMessageText,
    setSending
  });

  return {
    activeMessages,
    handleRemoveRecord: (record: NativeAssistantThreadIndexRecord) =>
      removeRecord(record, threads.removeRecord, dispatchCache),
    handleNewThread: () =>
      resetPendingAssistantConversation(dispatchCache, setMessageText, threads.selectThreadId),
    handleSelectRecord: (record: NativeAssistantThreadIndexRecord) => selectRecord(record, args.nodesById, args.onSelectNode, threads.selectThreadId),
    handleSubmit: createAssistantSubmitHandler(args, {
      activeTurnRef,
      dispatchCache,
      followCurrentMaterial,
      location,
      messageText,
      selectedRecord,
      sending,
      setMessageText,
      setSending,
      threads
    }),
    loading: threads.loading,
    followCurrentMaterial,
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
    setFollowCurrentMaterial,
    threadMessageStatus
  };
}

async function removeRecord(
  record: NativeAssistantThreadIndexRecord,
  remove: (record: NativeAssistantThreadIndexRecord) => Promise<boolean>,
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void
) {
  if (await remove(record)) dispatchCache({ key: record.providerThreadId, type: 'delete' });
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
