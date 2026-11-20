// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { createCompanionSandboxScenarioStore } from '../../scripts/vite/companionSandboxScenarios';

import { createSyncState, syncObjectsMock, syncPlatformMock } from './companionWorkspaceSyncFlow.testHarness';
import { useCompanionSandboxSyncScenario } from './useCompanionSandboxSyncScenario';

afterEach(() => { delete window.__folioleSandboxScenarios; });

it('runs a simulated discovery failure through normal sync handling and restores the preceding error on disable', async () => {
  const store = createCompanionSandboxScenarioStore();
  window.__folioleSandboxScenarios = store;
  const syncState = createSyncState();
  const setSyncProgress = vi.fn();
  const { result } = renderHook(() => {
    const [state, setState] = useState(syncState);
    const [error, setError] = useState<string | null>('baseline');
    const [status, setStatus] = useState<'idle' | 'loading' | 'syncing'>('idle');
    useCompanionSandboxSyncScenario({ error, setError, state, setState, isWorkspaceSyncStateReady: true, setStatus }, setSyncProgress);
    return { error, state, status };
  });

  expect(result.current.error).toBe('baseline');
  act(() => store.setEnabled('sync-failure', true));
  await waitFor(() => expect(result.current.error).toBe('discovery_connection_failed'));
  expect(result.current.state).toBe(syncState);
  expect(result.current.status).toBe('idle');
  expect(syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints).not.toHaveBeenCalled();
  expect(syncObjectsMock.syncCompanionObjectsFromDesktop).not.toHaveBeenCalled();

  act(() => store.setEnabled('sync-failure', false));
  expect(result.current.error).toBe('baseline');
});
