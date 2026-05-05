import { describe, expect, it, vi } from 'vitest';

import { isViteServerReady } from './electron-dev-server.mjs';

describe('isViteServerReady', () => {
  it('returns true when server responds with ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    await expect(isViteServerReady('http://127.0.0.1:4600', fetchMock)).resolves.toBe(true);
  });

  it('returns false when request fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect failed'));
    await expect(isViteServerReady('http://127.0.0.1:4600', fetchMock)).resolves.toBe(false);
  });
});
