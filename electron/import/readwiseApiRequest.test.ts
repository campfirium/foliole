// @vitest-environment node

import { expect, it, vi } from 'vitest';

vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: () => true,
  loadReadwiseHostAssignment: () => ({ is_active: true })
}));
vi.mock('../database/readwiseRemoteIdentity.js', () => ({
  loadReadwiseRemoteSource: () => ({ connectionRef: 'connection-1' })
}));
vi.mock('./readwiseApiConnection.js', () => ({ saveReconnectRequired: vi.fn() }));
vi.mock('./readwiseApiConnectionState.js', () => ({ loadStoredReadwiseHostSettings: () => ({}) }));

import { createReadwiseRequest } from './readwiseApiRequest.js';

it('retries a transient request three times before succeeding', async () => {
  const fetchImpl = vi.fn()
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 502 }))
    .mockResolvedValueOnce(Response.json({ results: [] })) as typeof fetch;
  const request = createReadwiseRequest('token', {
    allowFolderModeForCutover: true, fetchImpl, minIntervalMs: 0
  }, 'connection-1');

  await expect(request(new URL('https://readwise.io/api/v3/list/')))
    .resolves.toEqual({ results: [] });
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

it('does not change the routine sync retry budget', async () => {
  const fetchImpl = vi.fn().mockRejectedValue(new TypeError('offline')) as typeof fetch;
  const request = createReadwiseRequest('token', { fetchImpl, minIntervalMs: 0 }, 'connection-1');

  await expect(request(new URL('https://readwise.io/api/v3/list/'))).rejects.toThrow('offline');
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});
