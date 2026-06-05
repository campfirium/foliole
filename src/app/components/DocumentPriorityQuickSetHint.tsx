import { useTranslation } from '../../shared/localization/LocalizationProvider';

interface DocumentPriorityQuickSetHintProps {
  isActive: boolean;
  onPriorityChange?: (priority: number) => void;
  priority: number;
}

function normalizePriority(value: number) {
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  if (rounded >= 9) return 9;
  return rounded;
}

function PriorityQuickSetSlider(props: Pick<DocumentPriorityQuickSetHintProps, 'onPriorityChange' | 'priority'>) {
  const t = useTranslation();
  const priority = normalizePriority(props.priority);
  const progress = `${(priority / 9) * 100}%`;
  return (
    <div className="w-full">
      <div className="relative h-6">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/16" />
        <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/32" style={{ width: progress }} />
        <div
          aria-hidden="true"
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/28 bg-bg-elevated shadow-control"
          style={{ left: progress }}
        />
        <input
          aria-label={t('desktop.priorityQuickSet.slider')}
          className="pointer-events-auto absolute inset-0 h-6 w-full cursor-pointer opacity-0"
          max={9}
          min={0}
          onChange={(event) => props.onPriorityChange?.(Number(event.currentTarget.value))}
          step={1}
          type="range"
          value={priority}
        />
      </div>
    </div>
  );
}

export function DocumentPriorityQuickSetHint({ isActive, onPriorityChange, priority }: DocumentPriorityQuickSetHintProps) {
  const t = useTranslation();
  if (!isActive) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-command-palette flex items-center justify-center px-4" role="presentation">
      <section
        aria-label={t('desktop.priorityQuickSet.dialog')}
        aria-live="polite"
        className="grid w-full max-w-sm gap-5 rounded-lg border border-[var(--app-floating-border-color)] bg-[color-mix(in_oklab,var(--app-floating-surface-bg)_82%,rgb(var(--color-background)))] px-5 py-4 text-foreground/72 shadow-popover"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/50">
            <span className="size-2 rounded-full bg-foreground/32" aria-hidden="true" />
            {t('desktop.priorityQuickSet.title')}
          </div>
          <div className="flex items-baseline gap-2 text-sm font-semibold tabular-nums">
            <span className="text-foreground/82">{normalizePriority(priority)}</span>
            <span className="text-foreground/34">/</span>
            <span className="text-foreground/48">9</span>
          </div>
        </div>

        <PriorityQuickSetSlider {...(onPriorityChange ? { onPriorityChange } : {})} priority={priority} />

        <div className="flex items-center gap-2 text-xs text-foreground/62">
          <kbd className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold">0-9</kbd>
          <span>{t('desktop.priorityQuickSet.keyboardHint')}</span>
        </div>
      </section>
    </div>
  );
}
