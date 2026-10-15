import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ request: vi.fn(), cancel: vi.fn(async () => {}) }));
vi.mock('../../companionWorkspaceRuntimeRepository.js', () => ({ FolioleCompanionSync: {
  desktopHttpRequest: native.request, cancelRequestSyncHttp: native.cancel
} }));
vi.mock('../runtime/companionFramedPayloadBudget.js', () => ({
  companionFramedFileOwner: () => ({ library_key: 'library', generation_id: 'generation' })
}));
vi.mock('../runtime/iosCompanionDatabaseBootstrap.js', () => ({ getIosCompanionDatabaseOwner: () => ({}) }));
vi.mock('./signedRequest.js', () => ({ createSignedRequestHeaders: async () => ({ 'X-Nonce': crypto.randomUUID() }) }));

import { requestCompanionSyncSession } from './companionSyncSessionHttp.js';

it('cancels the exact native request when foreground ownership ends and rejects its late result', async () => {
  let resolve!: (value: { body: string; status: number }) => void;
  native.request.mockImplementation(() => new Promise(accept => { resolve = accept; }));
  const controller = new AbortController();
  const pending = requestCompanionSyncSession('http://desktop', { operation: 'open' }, controller.signal);
  const rejected = expect(pending).rejects.toThrow('background');
  await vi.waitFor(() => expect(native.request).toHaveBeenCalled());
  controller.abort(new Error('background'));
  const sent = native.request.mock.calls[0]![0];
  expect(native.cancel).toHaveBeenCalledWith({ library_key: 'library', generation_id: 'generation', request_id: sent.request_id });
  resolve({ status: 200, body: '{}' });
  await rejected;
});
