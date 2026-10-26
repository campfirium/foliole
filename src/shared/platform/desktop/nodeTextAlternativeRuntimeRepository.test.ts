import { afterEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from '../electronApi';

import { dismissRuntimeNodeTextAlternative, promoteRuntimeNodeTextAlternative } from './nodeTextAlternativeRuntimeRepository';

afterEach(() => { delete window.electronAPI; });

it.each([
  [dismissRuntimeNodeTextAlternative, 'dismiss_node_text_alternative'],
  [promoteRuntimeNodeTextAlternative, 'promote_node_text_alternative']
] as const)('passes the known owner through %s', async (mutate, command) => {
  const invoke = vi.fn().mockResolvedValue({ node_id: 'topic', status: 'dismissed' });
  window.electronAPI = { invoke } as unknown as ElectronAPI;
  await mutate('topic', 'alternative');
  expect(invoke).toHaveBeenCalledExactlyOnceWith(command, { node_id: 'topic', alternative_id: 'alternative' });
});
