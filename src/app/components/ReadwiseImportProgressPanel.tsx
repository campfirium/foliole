import { useTranslation } from '../../shared/localization/LocalizationProvider';

import type { ReadwiseImportProgressView } from './readwiseImportProgressView';

export function ReadwiseImportProgressPanel(props: {
  isRunning: boolean;
  progress: ReadwiseImportProgressView | null;
}) {
  const t = useTranslation();
  if (!props.isRunning && !props.progress) {
    return null;
  }
  const progress = props.progress ?? {
    message: t('desktop.readwise.progress.preparing'),
    progress: null
  };
  const percent = progress.progress === null ? null : Math.round(progress.progress * 100);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/65 px-3 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
        <p aria-live="polite" className="min-w-0 truncate text-foreground">
          {progress.message}
        </p>
        {percent !== null ? (
          <span className="shrink-0 tabular-nums text-foreground/65">{percent}%</span>
        ) : null}
      </div>
      <div
        aria-label={t('desktop.readwise.progress.aria')}
        aria-valuemax={100}
        aria-valuemin={0}
        {...(percent !== null ? { 'aria-valuenow': percent } : {})}
        className="h-2 overflow-hidden rounded-full bg-foreground/10"
        role="progressbar"
      >
        <div
          aria-hidden="true"
          className={percent === null
            ? 'h-full w-0 rounded-full bg-foreground/45'
            : 'h-full rounded-full bg-foreground/70 transition-[width] duration-200'}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
