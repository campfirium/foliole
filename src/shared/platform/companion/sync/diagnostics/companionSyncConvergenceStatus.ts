import type { SyncDiagnosticSeverity } from '../../../../../../lib/platform/syncDiagnosticsContract';

export type SyncConvergenceStatus = 'converged' | 'pending' | 'system_fault' | 'unknown';

export function deriveSyncConvergenceStatus(checks: Array<{ severity: SyncDiagnosticSeverity }>): SyncConvergenceStatus {
  if (checks.some((item) => item.severity === 'error')) return 'system_fault';
  if (checks.some((item) => item.severity === 'warning' || item.severity === 'info')) return 'pending';
  if (checks.every((item) => item.severity === 'ok')) return 'converged';
  return 'unknown';
}
