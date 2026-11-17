import { create } from 'zustand';

import { isImportAccessDenied } from '../../shared/platform/import/importAccess';
import type { RuntimeDirectoryImportResult, RuntimeTextImportResult } from '../../shared/platform/importExecutionRuntimeRepository';

interface ImportAccessNotice {
  names: string[];
  chooseAgain(): void;
}

export const useFormalImportAccessNotice = create<{ notice: ImportAccessNotice | null }>(() => ({ notice: null }));

export function notifyFormalImportAccessDenied(error: unknown, chooseAgain: (() => void) | undefined, names: string[] = []) {
  if (!chooseAgain || !isImportAccessDenied(error)) return;
  useFormalImportAccessNotice.setState({ notice: { names, chooseAgain } });
}

export function notifyFormalImportResultAccessDenied(
  result: RuntimeTextImportResult | RuntimeDirectoryImportResult,
  chooseAgain: (() => void) | undefined
) {
  const failures = ('entries' in result ? result.entries : [result])
    .filter(entry => entry.resultStatus === 'failed' && isImportAccessDenied(entry.failureReason));
  if (failures.length && chooseAgain) {
    useFormalImportAccessNotice.setState({ notice: { names: failures.map(entry => entry.sourceName), chooseAgain } });
  }
}
