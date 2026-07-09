import { useEffect } from 'react';

import type {
  NativeAssistantFailureCategory,
  NativeAssistantTurnEvent
} from '../../../lib/platform/nativeAssistantContract';
import { subscribeAssistantTurnEvents } from '../../shared/platform/assistantRuntime';

import {
  createFailedMessageAction,
  createStreamingMessageAction,
  messageCacheReducer
} from './workspaceRightSidebarAssistantPanelModel';

export type AssistantActiveTurn = {
  clientTurnId: string;
  prompt: string;
  threadKey: string;
};

export function useAssistantTurnEventSubscription(args: {
  activeTurnRef: { current: AssistantActiveTurn | null };
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  failedText: string;
  onCapabilityFailure: (category: NativeAssistantFailureCategory) => void;
  setMessageText: (text: string) => void;
  setSending: (sending: boolean) => void;
}) {
  useEffect(
    () =>
      subscribeAssistantTurnEvents((event) =>
        applyAssistantTurnEvent({
          activeTurnRef: args.activeTurnRef,
          dispatchCache: args.dispatchCache,
          event,
          failedText: args.failedText,
          onCapabilityFailure: args.onCapabilityFailure,
          setMessageText: args.setMessageText,
          setSending: args.setSending
        })
      ),
    [
      args.activeTurnRef,
      args.dispatchCache,
      args.failedText,
      args.onCapabilityFailure,
      args.setMessageText,
      args.setSending
    ]
  );
}

function applyAssistantTurnEvent(args: {
  activeTurnRef: { current: AssistantActiveTurn | null };
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  event: NativeAssistantTurnEvent;
  failedText: string;
  onCapabilityFailure: (category: NativeAssistantFailureCategory) => void;
  setMessageText: (text: string) => void;
  setSending: (sending: boolean) => void;
}) {
  const activeTurn = args.activeTurnRef.current;
  if (!activeTurn || args.event.clientTurnId !== activeTurn.clientTurnId) return;
  if (args.event.kind === 'delta')
    args.dispatchCache(createStreamingMessageAction(activeTurn.threadKey, activeTurn.clientTurnId, args.event.text ?? ''));
  if (args.event.kind === 'failed') {
    if (args.event.failure?.category) args.onCapabilityFailure(args.event.failure.category);
    args.dispatchCache(createFailedMessageAction(activeTurn.threadKey, activeTurn.clientTurnId, args.failedText));
    args.activeTurnRef.current = null;
    args.setMessageText(activeTurn.prompt);
    args.setSending(false);
  }
}
