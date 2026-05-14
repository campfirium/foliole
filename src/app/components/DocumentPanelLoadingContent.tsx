import { AppSpinner } from '../../shared/ui';

export function DocumentPanelLoadingContent({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div aria-busy="true" className="flex min-h-0 flex-1 items-center justify-center" role="status">
      <AppSpinner label={loadingLabel} />
    </div>
  );
}
