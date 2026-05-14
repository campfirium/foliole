import { AppButton, AppErrorState, AppLoadingState } from '../../shared/ui';
import type { WorkspaceNodeDocumentStatus } from '../../store/workspaceRendererBoundary';

export function DocumentPanelDocumentStatusContent(props: {
  loadingLabel: string;
  onRetry: () => void;
  retrying: boolean;
  status: WorkspaceNodeDocumentStatus;
}) {
  if (props.retrying || props.status === 'fetching') {
    return <AppLoadingState description="The selected topic body is still loading." title={props.loadingLabel} />;
  }
  return (
    <AppErrorState
      action={
        <AppButton disabled={props.retrying} onClick={props.onRetry} size="sm" variant="primary">
          Retry
        </AppButton>
      }
      description={props.status === 'missing'
        ? 'This topic body has not reached this device yet.'
        : 'The topic body could not be loaded.'}
      title="Topic body unavailable"
    />
  );
}
