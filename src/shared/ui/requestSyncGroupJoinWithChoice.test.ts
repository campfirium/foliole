import { afterEach, expect, it, vi } from 'vitest';

import type { Translate } from '../localization/LocalizationProvider';

import { registerAppChoiceHandler } from './appChoice';
import { requestSyncGroupJoinWithChoice } from './requestSyncGroupJoinWithChoice';

const t = ((key: string) => key) as Translate;
const blocked = new Error('sync_group_merge_requires_overwrite');
let unregister = () => {};
afterEach(() => unregister());

it('waits for an explicit overwrite choice and retries the same request once', async () => {
  let decide!: (choice: string | null) => void;
  unregister = registerAppChoiceHandler(() => new Promise((resolve) => { decide = resolve; }));
  const request = vi.fn().mockRejectedValueOnce(blocked).mockResolvedValueOnce('pending');
  const joining = requestSyncGroupJoinWithChoice(t, 'merge', request);
  await vi.waitFor(() => expect(decide).toBeDefined());
  expect(request.mock.calls).toEqual([['merge']]);
  decide('overwrite');
  expect(await joining).toBe('pending');
  expect(request.mock.calls).toEqual([['merge'], ['overwrite']]);
});

it('cancels without requesting an overwrite', async () => {
  unregister = registerAppChoiceHandler(async () => null);
  const request = vi.fn().mockRejectedValue(blocked);
  expect(await requestSyncGroupJoinWithChoice(t, 'merge', request)).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});

it.each(['merge', 'overwrite'] as const)('keeps ordinary %s errors visible', async (mode) => {
  const choice = vi.fn(async () => 'overwrite');
  unregister = registerAppChoiceHandler(choice);
  const request = vi.fn().mockRejectedValue(new Error('network_unavailable'));
  await expect(requestSyncGroupJoinWithChoice(t, mode, request)).rejects.toThrow('network_unavailable');
  expect(choice).not.toHaveBeenCalled();
});

it('handles the Electron error envelope on the applicant', async () => {
  unregister = registerAppChoiceHandler(async () => 'overwrite');
  const request = vi.fn().mockRejectedValueOnce(new Error(
    "Error invoking remote method 'foliole:invoke': Error: sync_group_merge_requires_overwrite"
  )).mockResolvedValueOnce('pending');
  expect(await requestSyncGroupJoinWithChoice(t, 'merge', request)).toBe('pending');
});

it('does not retry or ask again when an overwrite request fails', async () => {
  const choice = vi.fn(async () => 'overwrite');
  unregister = registerAppChoiceHandler(choice);
  const request = vi.fn().mockRejectedValue(blocked);
  await expect(requestSyncGroupJoinWithChoice(t, 'merge', request)).rejects.toThrow(blocked.message);
  expect(choice).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(2);
});
