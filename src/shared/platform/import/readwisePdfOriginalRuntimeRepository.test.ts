import { afterEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';

import { getRuntimeReadwisePdfOriginal, loadRuntimeReadwisePdfOriginalActionState } from './readwisePdfOriginalRuntimeRepository';

function installInvoke(invoke: NativeInvoke) {
  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: vi.fn(() => () => undefined),
    onNativeMenuCommand: vi.fn(() => () => undefined),
    onWindowResized: vi.fn(() => () => undefined)
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reads action availability and invokes the PDF original operation through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValueOnce({ node_id: 'pdf', status: 'ready' })
    .mockResolvedValueOnce({ node_id: 'pdf', status: 'completed' });
  installInvoke(invoke);
  await expect(loadRuntimeReadwisePdfOriginalActionState('pdf')).resolves.toMatchObject({ status: 'ready' });
  await expect(getRuntimeReadwisePdfOriginal('pdf')).resolves.toMatchObject({ status: 'completed' });
  expect(invoke).toHaveBeenNthCalledWith(1, 'load_readwise_pdf_original_action_state', { node_id: 'pdf' });
  expect(invoke).toHaveBeenNthCalledWith(2, 'get_readwise_pdf_original', { node_id: 'pdf' });
});

it('rejects malformed native responses', async () => {
  const invoke = vi.fn().mockResolvedValueOnce({ node_id: 'pdf', status: 'other' })
    .mockResolvedValueOnce({ node_id: 'pdf', status: 'failed', error_code: 4 });
  installInvoke(invoke);
  await expect(loadRuntimeReadwisePdfOriginalActionState('pdf')).resolves.toBeNull();
  await expect(getRuntimeReadwisePdfOriginal('pdf')).resolves.toBeNull();
});
