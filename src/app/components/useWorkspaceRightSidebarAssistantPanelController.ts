import { useMemo, useReducer, useRef, useState } from 'react';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantProviderId,
  NativeAssistantThreadIndexRecord,
  NativeAssistantWorkspaceContext
} from '../../../lib/platform/nativeAssistantContract';
import type { NativeAssistantImageDraft } from '../../../lib/platform/nativeAssistantImageContract';
import type { Node } from '../../features/nodes/model/nodeTypes';

import { useAssistantTurnEventSubscription, type AssistantActiveTurn } from './useAssistantTurnEventSubscription';
import { useFolioleAideContextFollow } from './useFolioleAideContextFollow';
import { useFolioleAideModelControls } from './useFolioleAideModelControls';
import { useWorkspaceRightSidebarAssistantThreadMessages } from './useWorkspaceRightSidebarAssistantThreadMessages';
import { useWorkspaceRightSidebarAssistantThreads } from './useWorkspaceRightSidebarAssistantThreads';
import type { WorkspaceLayoutDocumentProps } from './workspaceLayoutPropGroups';
import { resetPendingAssistantConversation } from './workspaceRightSidebarAssistantConversationReset';
import {
  appendAssistantImageFiles,
  type AssistantImageDraftError
} from './workspaceRightSidebarAssistantImages';
import type { AssistantMessage } from './workspaceRightSidebarAssistantMessageModel';
import {
  messageCacheReducer,
  PENDING_THREAD_KEY,
  resolveAssistantLocation
} from './workspaceRightSidebarAssistantPanelModel';
import {
  createAssistantProviderControls,
  findSelectedAssistantRecord,
  getSelectedAssistantThreadNotice,
  isAssistantProviderReady,
  selectAssistantRecord
} from './workspaceRightSidebarAssistantProvider';
import { createAssistantSubmitHandler } from './workspaceRightSidebarAssistantSubmitHandler';

type AssistantPanelControllerArgs = {
  activeNodeId: string | null;
  aideReady: boolean;
  byokConfigured: boolean;
  byokModel: string;
  codexReady: boolean;
  editorAdapterRef?: WorkspaceLayoutDocumentProps['editorAdapterRef'] | undefined;
  failedText: string;
  nodesById: Record<string, Node>;
  onCapabilityFailure: (provider: NativeAssistantProviderId, category: NativeAssistantFailureCategory) => void;
  onSelectProvider: (provider: NativeAssistantProviderId) => Promise<void>;
  onSelectNode: (nodeId: string) => void;
  topicUnavailableText: string;
  selectedProvider: NativeAssistantProviderId;
  workspaceContextOverride?: NativeAssistantWorkspaceContext | undefined;
};

export function useWorkspaceRightSidebarAssistantPanelController(args: AssistantPanelControllerArgs) {
  const location = useMemo(
    () => resolveAssistantLocation(args.activeNodeId, args.nodesById),
    [args.activeNodeId, args.nodesById]
  );
  const threads = useWorkspaceRightSidebarAssistantThreads(args.aideReady);
  const [messageText, setMessageText] = useState('');
  const imageState = useAssistantImageDraftState(setMessageText);
  const [messagesByThread, dispatchCache] = useReducer(messageCacheReducer, {});
  const [sending, setSending] = useState(false);
  const [followCurrentMaterial, setFollowCurrentMaterial] = useFolioleAideContextFollow();
  const modelControls = useFolioleAideModelControls(args.aideReady && args.codexReady);
  const activeTurnRef = useRef<AssistantActiveTurn | null>(null);
  const activeMessages = messagesByThread[threads.selectedThreadId ?? PENDING_THREAD_KEY] ?? [];
  const selectedRecord = findSelectedAssistantRecord(threads.records, threads.selectedThreadId);
  const threadMessageStatus = useWorkspaceRightSidebarAssistantThreadMessages({
    dispatchCache,
    messagesByThread,
    ...(selectedRecord ? { provider: selectedRecord.provider } : {}),
    selectedThreadId: threads.selectedThreadId
  });

  useAssistantTurnEventSubscription({
    activeTurnRef,
    dispatchCache,
    failedText: args.failedText,
    onCapabilityFailure: args.onCapabilityFailure,
    onProviderThreadStarted: threads.selectThreadId,
    setMessageText,
    setSending
  });

  return createPanelControllerResult({
    activeMessages,
    activeTurnRef,
    args,
    dispatchCache,
    followCurrentMaterial,
    imageState,
    location,
    messageText,
    modelControls,
    selectedRecord,
    sending,
    setMessageText,
    setFollowCurrentMaterial,
    setSending,
    threadMessageStatus,
    threads
  });
}

function useAssistantImageDraftState(setMessageText: (text: string) => void) {
  const [imageDrafts, setImageDrafts] = useState<NativeAssistantImageDraft[]>([]);
  const [imageError, setImageError] = useState<AssistantImageDraftError | null>(null);
  return {
    addImageFiles: async (files: File[]) => {
      const result = await appendAssistantImageFiles(imageDrafts, files);
      setImageDrafts(result.images);
      setImageError(result.error);
    },
    editMessage: (message: AssistantMessage) => {
      setMessageText(message.text);
      setImageDrafts(message.images ?? []);
      setImageError(null);
    },
    imageDrafts,
    imageError,
    removeImage: (index: number) => {
      setImageDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
      setImageError(null);
    },
    reset: () => {
      setImageDrafts([]);
      setImageError(null);
    },
    setImageDrafts
  };
}

type ControllerResultInput = {
  activeMessages: AssistantMessage[];
  activeTurnRef: { current: AssistantActiveTurn | null };
  args: AssistantPanelControllerArgs;
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  followCurrentMaterial: boolean;
  imageState: ReturnType<typeof useAssistantImageDraftState>;
  location: ReturnType<typeof resolveAssistantLocation>;
  messageText: string;
  modelControls: ReturnType<typeof useFolioleAideModelControls>;
  selectedRecord: NativeAssistantThreadIndexRecord | null;
  sending: boolean;
  setFollowCurrentMaterial: (value: boolean) => void;
  setMessageText: (value: string) => void;
  setSending: (value: boolean) => void;
  threadMessageStatus: ReturnType<typeof useWorkspaceRightSidebarAssistantThreadMessages>;
  threads: ReturnType<typeof useWorkspaceRightSidebarAssistantThreads>;
};

function createPanelControllerResult(input: ControllerResultInput) {
  const { args, imageState, threads } = input;
  return {
    activeMessages: input.activeMessages,
    addImageFiles: imageState.addImageFiles,
    editMessage: imageState.editMessage,
    followCurrentMaterial: input.followCurrentMaterial,
    handleNewThread: () => {
      imageState.reset();
      resetPendingAssistantConversation(input.dispatchCache, input.setMessageText, threads.selectThreadId);
    },
    handleRemoveRecord: (record: NativeAssistantThreadIndexRecord) =>
      removeRecord(record, threads.removeRecord, input.dispatchCache),
    handleSelectRecord: (record: NativeAssistantThreadIndexRecord) =>
      selectAssistantRecord(record, args.nodesById, args.onSelectNode, threads.selectThreadId),
    handleSubmit: createControllerSubmitHandler(input),
    imageDrafts: imageState.imageDrafts,
    imageError: imageState.imageError,
    loading: threads.loading,
    messageText: input.messageText,
    modelControls: input.modelControls,
    providerControls: createAssistantProviderControls(args, input.selectedRecord),
    records: threads.records,
    reloadThreads: threads.reload,
    removeImage: imageState.removeImage,
    removingThreadId: threads.removingThreadId,
    selectedRecord: input.selectedRecord,
    selectedThreadId: threads.selectedThreadId,
    selectedThreadNotice: getSelectedAssistantThreadNotice(
      input.selectedRecord,
      args.nodesById,
      args.topicUnavailableText
    ),
    sending: input.sending,
    setFollowCurrentMaterial: input.setFollowCurrentMaterial,
    setMessageText: input.setMessageText,
    threadError: threads.error,
    threadMessageStatus: input.threadMessageStatus
  };
}

function createControllerSubmitHandler(input: ControllerResultInput) {
  const { args, imageState } = input;
  const provider = input.selectedRecord?.provider ?? args.selectedProvider;
  return createAssistantSubmitHandler({
    ...args,
    aideReady: args.aideReady && (
      input.selectedRecord !== null || isAssistantProviderReady(provider, args)
    )
  }, {
    activeTurnRef: input.activeTurnRef,
    dispatchCache: input.dispatchCache,
    followCurrentMaterial: input.followCurrentMaterial,
    imageDrafts: imageState.imageDrafts,
    location: input.location,
    messageText: input.messageText,
    ...(input.modelControls.selection ? { modelSelection: input.modelControls.selection } : {}),
    provider,
    refreshModelCatalog: input.modelControls.refresh,
    selectedRecord: input.selectedRecord,
    sending: input.sending,
    setImageDrafts: imageState.setImageDrafts,
    setMessageText: input.setMessageText,
    setSending: input.setSending,
    threads: input.threads
  });
}


async function removeRecord(
  record: NativeAssistantThreadIndexRecord,
  remove: (record: NativeAssistantThreadIndexRecord) => Promise<boolean>,
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void
) {
  if (await remove(record)) dispatchCache({ key: record.providerThreadId, type: 'delete' });
}
