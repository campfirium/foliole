import { useEffect } from 'react';

import type { NativeAssistantTurnEvent } from '../../../lib/platform/nativeAssistantContract';
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
  setMessageText: (text: string) => void;
  setSending: (sending: boolean) => void;
}) {
  useEffect(
    () =>
      subscribeAssistantTurnEvents((event) =>
        applyAssistantTurnEvent({
          activeTurn: args.activeTurnRef.current,
          dispatchCache: args.dispatchCache,
          event,
          failedText: args.failedText,
          setMessageText: args.setMessageText,
          setSending: args.setSending
        })
      ),
    [args.activeTurnRef, args.dispatchCache, args.failedText, args.setMessageText, args.setSending]
  );
}

function applyAssistantTurnEvent(args: {
  activeTurn: AssistantActiveTurn | null;
  dispatchCache: (action: Parameters<typeof messageCacheReducer>[1]) => void;
  event: NativeAssistantTurnEvent;
  failedText: string;
  setMessageText: (text: string) => void;
  setSending: (sending: boolean) => void;
}) {
  const activeTurn = args.activeTurn;
  if (!activeTurn || args.event.clientTurnId !== activeTurn.clientTurnId) return;
  if (args.event.kind === 'delta')
    args.dispatchCache(createStreamingMessageAction(activeTurn.threadKey, activeTurn.clientTurnId, args.event.text ?? ''));
  if (args.event.kind === 'failed') {
    args.dispatchCache(createFailedMessageAction(activeTurn.threadKey, activeTurn.clientTurnId, args.failedText));
    args.setMessageText(activeTurn.prompt);
    args.setSending(false);
  }
}
