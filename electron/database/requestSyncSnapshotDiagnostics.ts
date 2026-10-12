export function createRequestSyncSnapshotDiagnostics(databasePath: string) {
  const enabled = process.env.FOLIOLE_REQUEST_SYNC_DIAGNOSTICS === '1';
  const counts = { opens: 0, openMs: 0, closes: 0, closeMs: 0, snapshots: 0, busy: 0 };
  const reportedErrors = new WeakSet<object>();
  function report(event: string) {
    if (enabled) process.stderr.write(`${JSON.stringify({ event: `request_sync_snapshot_${event}`,
      pid: process.pid, databasePath, ...counts,
      averageOpenMs: counts.opens ? counts.openMs / counts.opens : 0 })}\n`);
  }
  return {
    opened(elapsedMs: number) { counts.opens++; counts.openMs += elapsedMs; report('opened'); },
    closed(elapsedMs: number) { counts.closes++; counts.closeMs += elapsedMs; report('closed'); },
    snapshot() { counts.snapshots++; },
    failed(error: unknown) {
      if (typeof error === 'object' && error && 'code' in error &&
          typeof error.code === 'string' && error.code.startsWith('SQLITE_BUSY') && !reportedErrors.has(error)) {
        reportedErrors.add(error);
        counts.busy++; report('busy');
      }
    }
  };
}
