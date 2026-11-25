import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName } from '../../shared/ui';

interface DocumentPriorityQuickSetHintProps {
  isActive: boolean;
  inactive?: boolean;
  effectivePriority?: number;
  source?: ReactNode;
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
      <div className="app-focus-proxy relative h-6 rounded-sm">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/16" />
        <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/32" style={{ width: progress }} />
        <div
          aria-hidden="true"
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--app-control-border-color)] bg-[var(--app-surface-control-bg)] shadow-control"
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

export function DocumentPriorityQuickSetHint({
  effectivePriority, isActive, inactive, onPriorityChange, priority, source
}: DocumentPriorityQuickSetHintProps) {
  const t = useTranslation();
  if (!isActive) {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-modal flex items-center justify-center px-4" role="presentation">
      <section
        aria-label={t('desktop.priorityQuickSet.dialog')}
        aria-live="polite"
        className={appFloatingSurfaceClassName('popover', 'grid w-full max-w-sm gap-5 px-5 py-4 text-foreground/72')}
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/50">
            <span className="size-2 rounded-full bg-foreground/32" aria-hidden="true" />
            {t('desktop.priorityQuickSet.title')}
            {inactive && <span className="normal-case tracking-normal text-foreground/70">{t('desktop.nodeReview.priority.inactive')}</span>}
          </div>
          <div className="flex items-baseline gap-2 text-sm font-semibold tabular-nums data-[inactive=true]:opacity-[0.46]"
            data-inactive={inactive}>
            <span className="text-foreground/82">{normalizePriority(priority)}</span>
            <span className="text-foreground/34">/</span>
            <span className="text-foreground/48">9</span>
          </div>
        </div>

        <div className="data-[inactive=true]:opacity-[0.46]" data-inactive={inactive}>
          <PriorityQuickSetSlider {...(onPriorityChange ? { onPriorityChange } : {})} priority={priority} />
        </div>

        <div className="flex items-center gap-2 text-xs text-foreground/62">
          <kbd className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold">0-9</kbd>
          <span>{t(inactive ? 'desktop.priorityQuickSet.setOwn' : 'desktop.priorityQuickSet.keyboardHint')}</span>
        </div>
        {effectivePriority !== undefined && source !== undefined && (
          <dl className="pointer-events-auto grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border pt-2 text-xs">
            <dt>{t('desktop.diagnostics.scheduling.priority')}</dt><dd className="text-right">P{effectivePriority}</dd>
            <dt>{t('desktop.diagnostics.scheduling.prioritySource')}</dt><dd className="text-right">{source}</dd>
          </dl>
        )}
      </section>
    </div>,
    document.body
  );
}
