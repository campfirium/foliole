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
    outcomeUncertainText: 'Foliole may have changed. Check first.',
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

it('shows the outcome warning and does not invite a blind retry after a write interruption', () => {
  const activeTurnRef: { current: AssistantActiveTurn | null } = {
    current: {
      clientTurnId: 'client-2', prompt: 'Rename the topic', provider: 'openai-compatible',
      responseText: '', threadKey: 'thread-2'
    }
  };
  const dispatchCache = vi.fn();
  const setMessageText = vi.fn();

  applyAssistantTurnEvent({
    activeTurnRef,
    dispatchCache,
    event: {
      clientTurnId: 'client-2', failure: { category: 'tool_result_uncertain' },
      kind: 'failed', provider: 'openai-compatible'
    },
    failedText: 'Generic failure',
    outcomeUncertainText: 'Foliole may have changed. Check first.',
    onCapabilityFailure: vi.fn(),
    onProviderThreadStarted: vi.fn(),
    setMessageText,
    setSending: vi.fn()
  });

  expect(dispatchCache).toHaveBeenLastCalledWith(expect.objectContaining({
    message: expect.objectContaining({ text: 'Foliole may have changed. Check first.' })
  }));
  expect(setMessageText).not.toHaveBeenCalled();
});
