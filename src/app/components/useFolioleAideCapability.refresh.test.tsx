import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useFolioleAideCapability } from './useFolioleAideCapability';

const runtime = vi.hoisted(() => ({
  loadAssistantByokSettings: vi.fn(),
  loadAssistantStatus: vi.fn(),
  subscribeAssistantByokSettings: vi.fn(),
  subscribeAssistantStatusRefresh: vi.fn()
}));

vi.mock('../../shared/platform/assistantRuntime', () => runtime);

let refreshStatus: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  refreshStatus = null;
  runtime.loadAssistantByokSettings.mockResolvedValue({
    endpoint: '', has_api_key: false, model: '',
    selected_provider: 'codex-app-server', state: 'not_configured'
  });
  runtime.subscribeAssistantByokSettings.mockReturnValue(() => undefined);
  runtime.subscribeAssistantStatusRefresh.mockImplementation((listener: () => void) => {
    refreshStatus = listener;
    return () => { refreshStatus = null; };
  });
});

it('rechecks an open Aide capability after ChatGPT connects', async () => {
  runtime.loadAssistantStatus
    .mockResolvedValueOnce({
      capabilities: [], failure: { category: 'auth_failed' },
      provider: 'codex-app-server', state: 'unavailable'
    })
    .mockResolvedValueOnce({
      agentControl: { capabilities: ['materials.read'], state: 'running' },
      capabilities: [
        { enabled: true, name: 'status' },
        { enabled: true, name: 'sendMessage' },
        { enabled: true, name: 'threadIndex' },
        { enabled: true, name: 'agentControl' }
      ],
      provider: 'codex-app-server', state: 'ready'
    });

  const { result } = renderHook(() => useFolioleAideCapability());
  await waitFor(() => expect(result.current.state).toBe('unavailable'));
  act(() => refreshStatus?.());

  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(runtime.loadAssistantStatus).toHaveBeenCalledTimes(2);
});
