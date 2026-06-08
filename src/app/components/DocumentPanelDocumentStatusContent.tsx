import type { Translate } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppErrorState } from '../../shared/ui';
import type { WorkspaceNodeDocumentStatus } from '../../store/workspaceRendererBoundary';

import { DocumentPanelLoadingContent } from './DocumentPanelLoadingContent';

export function DocumentPanelDocumentStatusContent(props: {
  loadingLabel: string;
  onRetry: () => void;
  retrying: boolean;
  status: WorkspaceNodeDocumentStatus;
  t: Translate;
}) {
  if (props.retrying || props.status === 'fetching') {
    return <DocumentPanelLoadingContent loadingLabel={props.loadingLabel} />;
  }
  return (
    <AppErrorState
      action={
        <AppButton disabled={props.retrying} onClick={props.onRetry} size="sm" variant="default">
          {props.t('desktop.document.retry')}
        </AppButton>
      }
      description={props.status === 'missing'
        ? props.t('desktop.document.bodyUnavailable.missingDescription')
        : props.t('desktop.document.bodyUnavailable.failedDescription')}
      title={props.t('desktop.document.bodyUnavailable.title')}
    />
  );
}
