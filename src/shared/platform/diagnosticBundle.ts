import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeExportDiagnosticBundleResult } from '../../../lib/platform/nativeUtilityContract';

import { getRuntimeInvoke } from './runtimeInvoke';

export type ExportDiagnosticBundleResult =
  | {
      filePath: string;
      includedFileCount: number;
      status: 'exported';
    }
  | {
      filePath: null;
      includedFileCount: 0;
      status: 'unavailable';
    };

export async function exportDiagnosticBundle(): Promise<ExportDiagnosticBundleResult> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return {
      filePath: null,
      includedFileCount: 0,
      status: 'unavailable'
    };
  }
  const result = await runtimeInvoke(
    NATIVE_COMMANDS.exportDiagnosticBundle
  ) as NativeExportDiagnosticBundleResult;
  return {
    filePath: result.file_path,
    includedFileCount: result.included_file_count,
    status: result.status
  };
}
