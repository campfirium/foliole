import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeCopyDiagnosticReportResult } from '../../../lib/platform/nativeUtilityContract';

import { getRuntimeInvoke } from './runtimeInvoke';

export type CopyDiagnosticReportResult =
  | {
      reportText: string;
      status: 'generated';
    }
  | {
      reportText: null;
      status: 'unavailable';
    };

export async function copyDiagnosticReport(): Promise<CopyDiagnosticReportResult> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return {
      reportText: null,
      status: 'unavailable'
    };
  }
  const result = await runtimeInvoke(
    NATIVE_COMMANDS.copyDiagnosticReport
  ) as NativeCopyDiagnosticReportResult;
  return {
    reportText: result.report_text,
    status: result.status
  };
}

// Returns the redacted recent error lines, or null when unavailable, empty, failing or slower than the timeout.
export async function loadRecentErrorSummary(timeoutMs = 1000): Promise<string | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
  const request = runtimeInvoke(NATIVE_COMMANDS.copyDiagnosticReport, { scope: 'errors' })
    .then((result) => (result as NativeCopyDiagnosticReportResult).report_text.trim() || null)
    .catch(() => null);
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
