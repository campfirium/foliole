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

it('creates the formal body version before marking the alternate text promoted', async () => {
  const order: string[] = [];
  const onSetAsBody = vi.fn(async () => { order.push('version'); });
  repository.update.mockImplementation(async () => {
    order.push('status');
    return { ...alternative, status: 'promoted' };
  });
  const { result } = renderHook(() => useCompanionNodeTextAlternative({ nodeId: 'topic-1', onSetAsBody }));
  await waitFor(() => expect(result.current.alternative).not.toBeNull());

  await act(() => result.current.setAsBody());

  expect(onSetAsBody).toHaveBeenCalledWith('topic-1', 'Other body');
  expect(repository.update).toHaveBeenCalledWith('alternative-1', 'promoted');
  expect(order).toEqual(['version', 'status']);
  expect(result.current.alternative).toBeNull();
});
