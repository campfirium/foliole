import { useCallback, useEffect, useState } from 'react';

import type { NativeAssistantWriteApproval } from '../../../lib/platform/nativeAssistantContract';
import { resolveAssistantWriteApproval, subscribeAssistantTurnEvents } from '../../shared/platform/assistantRuntime';

import type { AssistantActiveTurn } from './useAssistantTurnEventSubscription';

/** The changes the current reply is waiting on, until the person allows or declines them or the reply ends. */
export function useAssistantWriteApproval(activeTurnRef: { current: AssistantActiveTurn | null }, sending: boolean) {
  const [approval, setApproval] = useState<NativeAssistantWriteApproval | null>(null);
  useEffect(() => subscribeAssistantTurnEvents((event) => {
    if (event.clientTurnId !== activeTurnRef.current?.clientTurnId) return;
    if (event.kind === 'approval_requested' && event.approval) setApproval(event.approval);
    if (event.kind === 'approval_cancelled') {
      setApproval((current) => current?.id === event.approvalId ? null : current);
    }
    if (event.kind === 'completed' || event.kind === 'failed') setApproval(null);
  }), [activeTurnRef]);
  useEffect(() => {
    if (!sending) setApproval(null);
  }, [sending]);
  const resolve = useCallback((approved: boolean) => {
    if (!approval) return;
    setApproval(null);
    void resolveAssistantWriteApproval(approval.id, approved).catch(() => undefined);
  }, [approval]);
  return { approval, resolve };
}
