import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from '../electronApi';

import {
  hydrateDemoSystemEntryDisplayNames,
  hydrateRuntimeSystemEntryDisplayNames,
  saveRuntimeSystemEntryDisplayNames
} from './systemEntryDisplayNamesRuntimeRepository';

const payload = { customDisplayNameById: { home: 'Library home' }, version: 1 } as const;

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('hydrates and saves through the two named desktop commands', async () => {
  const invoke = vi.fn(async (command: string) =>
    command === 'load_system_entry_display_names' ? payload : payload
  );
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  await expect(hydrateRuntimeSystemEntryDisplayNames()).resolves.toMatchObject({
    customDisplayNameById: { home: 'Library home' }
  });
  await saveRuntimeSystemEntryDisplayNames(payload, { demo: false });

  expect(invoke).toHaveBeenNthCalledWith(1, 'load_system_entry_display_names');
  expect(invoke).toHaveBeenNthCalledWith(2, 'save_system_entry_display_names', { payload });
});

it('keeps demo overrides in the resettable demo storage namespace', async () => {
  await saveRuntimeSystemEntryDisplayNames(payload, { demo: true });
  expect(window.localStorage.getItem('foliole-demo-system-entry-display-names-v1')).toContain(
    'Library home'
  );
  expect(hydrateDemoSystemEntryDisplayNames()).toEqual(payload);
});

it('does not fall back to browser storage when the production runtime is unavailable', async () => {
  await expect(saveRuntimeSystemEntryDisplayNames(payload, { demo: false })).rejects.toThrow(
    'system_entry_display_names_runtime_unavailable'
  );
  expect(window.localStorage).toHaveLength(0);
});
