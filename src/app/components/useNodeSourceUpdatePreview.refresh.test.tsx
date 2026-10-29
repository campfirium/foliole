import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  alternative: vi.fn(), incoming: vi.fn(),
  changed: vi.fn(), inbox: vi.fn()
}));
vi.mock('../../shared/platform/desktop/nodeTextAlternativeRuntimeRepository', () => ({
  loadRuntimeNodeTextAlternativePreview: runtime.alternative
}));
vi.mock('../../shared/platform/nodeSourceRuntimeRepository', () => ({
  loadRuntimeNodeSourceUpdatePreview: runtime.incoming
}));
vi.mock('../../shared/platform/runtimeShellEvents', () => ({
  onWorkspaceContentChanged: runtime.changed,
  onManagedInboxUpdated: runtime.inbox
}));

import { useNodeSourceUpdatePreview } from './useNodeSourceUpdatePreview';

afterEach(() => vi.resetAllMocks());

it('refreshes available alternatives after a committed workspace change and unsubscribes', async () => {
  let changed: (() => void) | undefined;
  const unsubscribe = vi.fn();
  runtime.changed.mockImplementation(async handler => { changed = handler; return unsubscribe; });
  runtime.inbox.mockResolvedValue(() => {});
  runtime.alternative.mockResolvedValue({ alternative_id: 'alt', source_node_id: 'topic' });
  runtime.incoming.mockResolvedValue(null);
  const view = renderHook(() => useNodeSourceUpdatePreview('topic'));
  await waitFor(() => expect(view.result.current.value).not.toBeNull());
  expect(changed).toBeTypeOf('function');
  runtime.alternative.mockResolvedValue(null);
  await act(async () => changed!());
  await waitFor(() => expect(view.result.current.value).toBeNull());
  expect(runtime.alternative).toHaveBeenLastCalledWith('topic', undefined);
  view.unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
