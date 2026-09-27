import type { OutboundNodeVersionReceipt } from './nodeVersionInboundReceipt.js';

export function parseNodeVersionReceipt(value: unknown): OutboundNodeVersionReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('node_version_receipt_invalid');
  }
  const receipt = value as Partial<OutboundNodeVersionReceipt>;
  const required = [receipt.deviceId, receipt.groupId, receipt.libraryEpoch,
    receipt.packId, receipt.sourceDeviceId];
  if (required.some((field) => typeof field !== 'string' || !field.trim()) ||
      !Number.isSafeInteger(receipt.proofRevision) || Number(receipt.proofRevision) < 1 ||
      !Array.isArray(receipt.results)) throw new Error('node_version_receipt_invalid');
  const seen = new Set<string>();
  for (const result of receipt.results) {
    if (!result || typeof result.objectId !== 'string' || !result.objectId ||
        typeof result.sentVersionId !== 'string' || !result.sentVersionId ||
        !['applied', 'blocked', 'not_applied'].includes(result.result) ||
        (result.baseVersionId !== null && typeof result.baseVersionId !== 'string') ||
        seen.has(result.objectId)) throw new Error('node_version_receipt_invalid');
    seen.add(result.objectId);
  }
  return receipt as OutboundNodeVersionReceipt;
}
