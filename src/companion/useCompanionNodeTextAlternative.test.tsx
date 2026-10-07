import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  load: vi.fn(),
  update: vi.fn()
}));

vi.mock('../shared/platform/companion/runtime/companionNodeTextAlternativeRepository', () => ({
  loadCompanionNodeTextAlternative: repository.load,
  updateCompanionNodeTextAlternativeStatus: repository.update
}));

import { useCompanionNodeTextAlternative } from './useCompanionNodeTextAlternative';

const alternative = {
  alternative_id: 'alternative-1', body_text: 'Other body', created_at: '2026-07-25T00:00:00.000Z',
  node_id: 'topic-1', source_host_name: 'android-device', source_version_id: 'android#1',
  status: 'available', updated_at: '2026-07-25T00:00:00.000Z'
};

beforeEach(() => {
  repository.load.mockReset().mockResolvedValue(alternative);
  repository.update.mockReset().mockResolvedValue({ ...alternative, status: 'promoted' });
});

it('adopts the whole version before refreshing the reading surface', async () => {
  const order: string[] = [];
  const onSetAsBody = vi.fn(async () => { order.push('version'); });
  repository.update.mockImplementation(async () => {
    order.push('adopt');
    repository.load.mockResolvedValue(null);
    return { ...alternative, status: 'promoted' };
  });
  const { result } = renderHook(() => useCompanionNodeTextAlternative({ nodeId: 'topic-1', onSetAsBody }));
  await waitFor(() => expect(result.current.alternative).not.toBeNull());

  await act(() => result.current.setAsBody());

  expect(onSetAsBody).toHaveBeenCalledWith('topic-1', 'Other body');
  expect(repository.update).toHaveBeenCalledWith('alternative-1', 'promoted');
  expect(order).toEqual(['adopt', 'version']);
  expect(result.current.alternative).toBeNull();
});

it('does not save an expired or concurrently removed body as a new edit', async () => {
  repository.update.mockResolvedValue({ status: 'unavailable', node_id: null });
  const onSetAsBody = vi.fn();
  const { result } = renderHook(() => useCompanionNodeTextAlternative({ nodeId: 'topic-1', onSetAsBody }));
  await waitFor(() => expect(result.current.alternative).not.toBeNull());
  await act(() => result.current.setAsBody());
  expect(onSetAsBody).not.toHaveBeenCalled();
  expect(result.current.error).toBe(true);
});
