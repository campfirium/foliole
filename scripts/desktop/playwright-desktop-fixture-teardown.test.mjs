// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { finalizeDesktopFixture } from './playwright-desktop-fixture-teardown.mjs';

it('always closes when evidence and diagnostics fail', async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const result = finalizeDesktopFixture({
    attachEvidence: vi.fn().mockRejectedValue(new Error('evidence failed')),
    attachDiagnostics: vi.fn().mockRejectedValue(new Error('diagnostics failed')),
    close,
    failed: true
  });
  await expect(result).rejects.toMatchObject({
    errors: [expect.objectContaining({ message: 'evidence failed' }), expect.objectContaining({ message: 'diagnostics failed' })]
  });
  expect(close).toHaveBeenCalledOnce();
});

it('preserves close errors beside evidence errors', async () => {
  await expect(finalizeDesktopFixture({
    attachEvidence: vi.fn().mockRejectedValue(new Error('evidence failed')),
    attachDiagnostics: vi.fn(),
    close: vi.fn().mockRejectedValue(new Error('close failed')),
    failed: false
  })).rejects.toMatchObject({
    errors: [expect.objectContaining({ message: 'evidence failed' }), expect.objectContaining({ message: 'close failed' })]
  });
});
