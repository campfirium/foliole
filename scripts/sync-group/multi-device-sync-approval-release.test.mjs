import { expect, it, vi } from 'vitest';

import { createApprovalReceiptRelease } from './multi-device-sync-approval-release.mjs';

it('releases the Android waiter only after its signed approval receipt is observed', async () => {
  const abort = vi.fn();
  const gate = createApprovalReceiptRelease(abort);
  const release = gate.release();
  await Promise.resolve();
  expect(abort).not.toHaveBeenCalled();
  gate.capture({ output: 'INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReceipt={"ok":true}' });
  await release;
  expect(abort).toHaveBeenCalledOnce();
});

it('recognizes a receipt assembled across cumulative action output', async () => {
  const abort = vi.fn();
  const gate = createApprovalReceiptRelease(abort);
  gate.capture({ output: 'INSTRUMENTATION_STATUS: folioleSyncGroupApproval' });
  expect(abort).not.toHaveBeenCalled();
  const release = gate.release();
  gate.capture({ output: 'INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReceipt={"ok":true}' });
  await release;
  expect(abort).toHaveBeenCalledOnce();
});
