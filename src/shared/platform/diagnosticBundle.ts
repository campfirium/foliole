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
