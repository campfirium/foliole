import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppSpinner, AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

const RESTORE_ACTION_CLASS_NAME =
  'pointer-events-auto inline-flex h-10 min-w-20 translate-x-[calc(100%+theme(spacing.3))] items-center justify-center gap-2 rounded-md border border-transparent bg-[var(--app-accent-color)] px-4 text-sm font-medium text-accent-foreground shadow-control transition-colors hover:bg-[rgb(var(--app-accent-color-rgb)/0.88)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 max-[1280px]:translate-x-0';

export function DocumentRestoreAction({
  ariaLabel,
  disabled = false,
  label,
  loading = false,
  loadingLabel,
  onRestore
}: {
  ariaLabel?: string;
  disabled?: boolean;
  label?: string;
  loading?: boolean;
  loadingLabel?: string;
  onRestore: () => void;
}) {
  const t = useTranslation();
  const resolvedLabel = label ?? t('desktop.documentRestore.action');
  const resolvedAriaLabel = ariaLabel ?? resolvedLabel;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-5 z-local-overlay overflow-visible">
      <div className="mx-auto flex w-full max-w-[var(--document-max-width)] justify-end px-[var(--document-content-inline-padding)]">
        <AppTooltip>
          <AppTooltipTrigger asChild>
            <button
              aria-label={resolvedAriaLabel}
              aria-busy={loading || undefined}
              className={`${RESTORE_ACTION_CLASS_NAME} ${loading ? 'disabled:opacity-100' : ''}`}
              disabled={disabled || loading}
              onClick={onRestore}
              type="button"
            >
              {loading ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}
              <span>{loading ? loadingLabel ?? resolvedLabel : resolvedLabel}</span>
            </button>
          </AppTooltipTrigger>
          <AppTooltipContent side="left">{resolvedAriaLabel}</AppTooltipContent>
        </AppTooltip>
      </div>
    </div>
  );
}
