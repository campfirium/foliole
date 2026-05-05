import type { CombinedSyncDiagnosticResult } from '../shared/platform/companionSyncDiagnostics';

export function buildSyncDiagnosticSummary(result: CombinedSyncDiagnosticResult) {
  return JSON.stringify({
    android: result.android,
    desktop: result.desktop,
    verdicts: result.verdicts
  }, null, 2);
}
