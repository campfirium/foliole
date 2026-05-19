import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

const RESTORE_ACTION_CLASS_NAME =
  'pointer-events-auto inline-flex h-10 min-w-20 translate-x-[calc(100%+theme(spacing.3))] items-center justify-center rounded-md border border-transparent bg-[var(--app-accent-color)] px-4 text-sm font-medium text-accent-foreground shadow-control transition-colors hover:bg-[rgb(var(--app-accent-color-rgb)/0.88)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 max-[1280px]:translate-x-0';

export function DocumentRestoreAction({
  ariaLabel,
  disabled = false,
  label = 'Restore',
  onRestore
}: {
  ariaLabel?: string;
  disabled?: boolean;
  label?: string;
  onRestore: () => void;
}) {
  const resolvedAriaLabel = ariaLabel ?? label;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-5 z-local-overlay overflow-visible">
      <div className="mx-auto flex w-full max-w-[var(--document-max-width)] justify-end px-[var(--document-content-inline-padding)]">
        <AppTooltip>
          <AppTooltipTrigger asChild>
            <button
              aria-label={resolvedAriaLabel}
              className={RESTORE_ACTION_CLASS_NAME}
              disabled={disabled}
              onClick={onRestore}
              type="button"
            >
              {label}
            </button>
          </AppTooltipTrigger>
          <AppTooltipContent side="left">{resolvedAriaLabel}</AppTooltipContent>
        </AppTooltip>
      </div>
    </div>
  );
}
