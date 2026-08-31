import { expect, it, vi } from 'vitest';

import type { NativeAssistantTurnEvent } from '../../../lib/platform/nativeAssistantContract';

import { applyAssistantTurnEvent, type AssistantActiveTurn } from './useAssistantTurnEventSubscription';

it('keeps a partial reply and does not restore the sent prompt when the turn later fails', () => {
  const activeTurnRef: { current: AssistantActiveTurn | null } = {
    current: {
      clientTurnId: 'client-1',
      prompt: 'Continue our discussion',
      provider: 'codex-app-server',
      responseText: '',
      threadKey: '__pending_assistant_thread__'
    }
  };
  const dispatchCache = vi.fn();
  const setMessageText = vi.fn();
  const setSending = vi.fn();
  const common = {
    activeTurnRef,
    dispatchCache,
    failedText: 'Foliole Aide could not reply.',
    onCapabilityFailure: vi.fn(),
    onProviderThreadStarted: vi.fn(),
    setMessageText,
    setSending
  };
  const emit = (event: NativeAssistantTurnEvent) => applyAssistantTurnEvent({ ...common, event });

  emit({
    clientTurnId: 'client-1',
    kind: 'started',
    provider: 'codex-app-server',
    providerThreadId: 'thread-1'
  });
  emit({
    clientTurnId: 'client-1',
    kind: 'delta',
    provider: 'codex-app-server',
    text: 'A useful partial reply'
  });
  emit({
    clientTurnId: 'client-1',
    failure: { category: 'timeout' },
    kind: 'failed',
    provider: 'codex-app-server',
    text: 'A useful partial reply'
  });

  expect(dispatchCache).toHaveBeenLastCalledWith(expect.objectContaining({
    key: 'thread-1',
    message: expect.objectContaining({
      failureText: 'Foliole Aide could not reply.',
      state: 'failed',
      text: 'A useful partial reply'
    })
  }));
  expect(common.onProviderThreadStarted).toHaveBeenCalledWith('thread-1');
  expect(setMessageText).not.toHaveBeenCalled();
  expect(setSending).toHaveBeenCalledWith(false);
});
