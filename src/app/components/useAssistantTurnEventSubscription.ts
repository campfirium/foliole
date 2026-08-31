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
  responseText: string;
  threadKey: string;
};

export function useAssistantTurnEventSubscription(args: {
  activeTurnRef: { current: AssistantActiveTurn | null };
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  failedText: string;
  onCapabilityFailure: (category: NativeAssistantFailureCategory) => void;
  onProviderThreadStarted: (providerThreadId: string) => void;
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
          onProviderThreadStarted: args.onProviderThreadStarted,
          setMessageText: args.setMessageText,
          setSending: args.setSending
        })
      ),
    [
      args.activeTurnRef,
      args.dispatchCache,
      args.failedText,
      args.onCapabilityFailure,
      args.onProviderThreadStarted,
      args.setMessageText,
      args.setSending
    ]
  );
}

export function applyAssistantTurnEvent(args: {
  activeTurnRef: { current: AssistantActiveTurn | null };
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  event: NativeAssistantTurnEvent;
  failedText: string;
  onCapabilityFailure: (category: NativeAssistantFailureCategory) => void;
  onProviderThreadStarted: (providerThreadId: string) => void;
  setMessageText: (text: string) => void;
  setSending: (sending: boolean) => void;
}) {
  const activeTurn = args.activeTurnRef.current;
  if (!activeTurn || args.event.clientTurnId !== activeTurn.clientTurnId) return;
  if (args.event.kind === 'started' && args.event.providerThreadId
    && activeTurn.threadKey !== args.event.providerThreadId) {
    args.dispatchCache({ fromKey: activeTurn.threadKey, toKey: args.event.providerThreadId, type: 'move' });
    activeTurn.threadKey = args.event.providerThreadId;
    args.onProviderThreadStarted(args.event.providerThreadId);
  }
  if (args.event.kind === 'delta') {
    activeTurn.responseText = args.event.text ?? '';
    args.dispatchCache(createStreamingMessageAction(activeTurn.threadKey, activeTurn.clientTurnId, args.event.text ?? ''));
  }
  if (args.event.kind === 'failed') {
    const partialText = args.event.text ?? activeTurn.responseText;
    if (args.event.failure?.category) args.onCapabilityFailure(args.event.failure.category);
    args.dispatchCache(createFailedMessageAction(
      activeTurn.threadKey,
      activeTurn.clientTurnId,
      args.failedText,
      partialText
    ));
    args.activeTurnRef.current = null;
    if (!partialText.trim()) args.setMessageText(activeTurn.prompt);
    args.setSending(false);
  }
}
