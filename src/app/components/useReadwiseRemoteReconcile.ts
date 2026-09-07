import { useState } from 'react';

import type {
  NativeReadwiseReconcileCancelResult,
  NativeReadwiseReconcileResult
} from '../../../lib/platform/nativeReadwiseApiImportContract';

export function useReadwiseRemoteReconcile(input: {
  onCancel?: (() => Promise<NativeReadwiseReconcileCancelResult | null>) | undefined;
  onRun?: (() => Promise<NativeReadwiseReconcileResult | null>) | undefined;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<NativeReadwiseReconcileResult | null>(null);

  async function run() {
    if (!input.onRun || isRunning) return;
    setIsRunning(true);
    setResult(null);
    try {
      setResult(await input.onRun());
    } catch {
      setResult(failedResult());
    } finally {
      setIsRunning(false);
    }
  }

  async function cancel() {
    if (!input.onCancel || !isRunning) return;
    await input.onCancel();
  }

  return { cancel, isRunning, result, run };
}

function failedResult(): NativeReadwiseReconcileResult {
  return {
    export_deleted_count: 0,
    present_count: 0,
    reader_missing_count: 0,
    reconciled_at: null,
    status: 'failed',
    unconfirmed_count: 0
  };
}
