import { randomUUID } from 'node:crypto';

import type { NativeAssistantWriteApproval, NativeAssistantWriteChange } from '../../lib/platform/nativeAssistantContract.js';

interface PendingApproval {
  clientTurnId: string;
  settle: (approved: boolean) => void;
}

const pending = new Map<string, PendingApproval>();

/** Shows the changes in the conversation and waits until the person allows or declines them. */
export function requestAideWriteApproval(input: {
  changes: NativeAssistantWriteChange[];
  clientTurnId: string;
  emit: (approval: NativeAssistantWriteApproval) => void;
  signal?: AbortSignal;
}): Promise<boolean> {
  if (input.signal?.aborted) return Promise.resolve(false);
  const id = randomUUID();
  return new Promise((resolve) => {
    const onAbort = () => settle(false);
    const settle = (approved: boolean) => {
      if (!pending.delete(id)) return;
      input.signal?.removeEventListener('abort', onAbort);
      resolve(approved);
    };
    pending.set(id, { clientTurnId: input.clientTurnId, settle });
    input.signal?.addEventListener('abort', onAbort, { once: true });
    input.emit({ changes: input.changes, id });
  });
}

export function resolveAideWriteApproval(approvalId: string, approved: boolean) {
  const entry = pending.get(approvalId);
  if (!entry) return false;
  entry.settle(approved);
  return true;
}

/** A reply that ends, or whose window closes, declines whatever it was still waiting on. */
export function cancelAideWriteApprovals(clientTurnId: string) {
  for (const entry of [...pending.values()]) {
    if (entry.clientTurnId === clientTurnId) entry.settle(false);
  }
}
