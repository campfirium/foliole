import { AppErrorState, AppLoadingState } from '../shared/ui';

export function CompanionSyncDiagnosticStatus(props: {
  error: string | null;
  status: 'checking' | 'idle' | 'running';
}) {
  if (props.error) {
    return (
      <AppErrorState
        className="min-h-0 items-start text-left text-error"
        description={props.error}
        title="Sync diagnostic failed"
      />
    );
  }
  if (props.status === 'running') {
    return (
      <AppLoadingState
        className="min-h-0 items-start text-left text-companion-text-secondary"
        description="Collecting sync state from this device and desktop."
        title="Running sync diagnostic"
      />
    );
  }
  if (props.status === 'checking') {
    return (
      <AppLoadingState
        className="min-h-0 items-start text-left text-companion-text-secondary"
        description="Checking whether this device and desktop have converged."
        title="Running convergence check"
      />
    );
  }
  return null;
}
