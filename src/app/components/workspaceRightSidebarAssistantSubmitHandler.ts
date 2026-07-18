import type { FormEvent } from 'react';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantThreadIndexRecord,
  NativeAssistantWorkspaceContext
} from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';

import type { AssistantActiveTurn } from './useAssistantTurnEventSubscription';
import type { useWorkspaceRightSidebarAssistantThreads } from './useWorkspaceRightSidebarAssistantThreads';
import type { WorkspaceLayoutDocumentProps } from './workspaceLayoutPropGroups';
import {
  createFailedMessageAction,
  createPendingMessageAction,
  createReadyMessageAction,
  createUserMessageAction,
  messageCacheReducer,
  PENDING_THREAD_KEY,
  resolveAssistantLocation
} from './workspaceRightSidebarAssistantPanelModel';
import { sendAssistantTurn } from './workspaceRightSidebarAssistantSend';

type AssistantSubmitPanelArgs = {
  activeNodeId: string | null;
  aideReady: boolean;
  editorAdapterRef?: WorkspaceLayoutDocumentProps['editorAdapterRef'] | undefined;
  failedText: string;
  nodesById: Record<string, Node>;
  onCapabilityFailure: (category: NativeAssistantFailureCategory) => void;
  workspaceContextOverride?: NativeAssistantWorkspaceContext | undefined;
};

type AssistantSubmitState = {
  activeTurnRef: { current: AssistantActiveTurn | null };
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  followCurrentMaterial: boolean;
  location: ReturnType<typeof resolveAssistantLocation>;
  messageText: string;
  selectedRecord: NativeAssistantThreadIndexRecord | null;
  sending: boolean;
  setMessageText: (text: string) => void;
  setSending: (sending: boolean) => void;
  threads: ReturnType<typeof useWorkspaceRightSidebarAssistantThreads>;
};

type SubmitHandlerArgs = AssistantSubmitPanelArgs & AssistantSubmitState;

export function createAssistantSubmitHandler(
  panel: AssistantSubmitPanelArgs,
  state: AssistantSubmitState
) {
  return createHandleSubmit({ ...panel, ...state });
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
    args.activeTurnRef.current = { clientTurnId: pendingId, prompt, responseText: '', threadKey };
    args.dispatchCache(createUserMessageAction(threadKey, pendingId, prompt));
    args.dispatchCache(createPendingMessageAction(threadKey, pendingId));
    try {
      const result = await sendAssistantTurn(
        {
          ...args,
          editorAdapterRef: args.editorAdapterRef,
          selectedThreadId: args.threads.selectedThreadId
        },
        pendingId,
        prompt
      );
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
    if (threadId !== result.threadKey)
      result.dispatchCache({ fromKey: result.threadKey, toKey: threadId, type: 'move' });
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

type SendResultArgs = SubmitHandlerArgs & {
  pendingId: string;
  prompt: string;
  result: NativeAssistantSendMessageResult | null;
  threadKey: string;
};
