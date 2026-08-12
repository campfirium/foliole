const APPROVAL_RECEIPT_PREFIX = 'INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReceipt=';

export function createApprovalReceiptRelease(abort) {
  let resolveReceipt;
  const receiptSeen = new Promise((resolve) => { resolveReceipt = resolve; });
  return {
    capture: ({ output }) => {
      if (output.includes(APPROVAL_RECEIPT_PREFIX)) resolveReceipt();
    },
    release: () => receiptSeen.then(abort)
  };
}
