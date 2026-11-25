import { createPortal } from 'react-dom';

import { DesktopPrioritySlider, type EnforcedPriorityDisplay } from '../../features/nodes/components/DesktopPrioritySlider';
import { normalizePushQueuePriority } from '../../features/review/model/unifiedPushQueueRules';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingSurfaceClassName } from '../../shared/ui';

interface DocumentPriorityQuickSetHintProps {
  isActive: boolean;
  enforced?: EnforcedPriorityDisplay | undefined;
  onPriorityChange?: (priority: number) => void;
  priority: number;
  ownPriority?: number | null | undefined;
}

export function DocumentPriorityQuickSetHint({
  enforced, isActive, onPriorityChange, ownPriority, priority
}: DocumentPriorityQuickSetHintProps) {
  const t = useTranslation();
  if (!isActive) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-modal flex items-center justify-center px-4" role="presentation">
      <section aria-label={t('desktop.priorityQuickSet.dialog')} role="dialog"
        className={appFloatingSurfaceClassName('popover', 'grid w-full max-w-sm gap-5 px-5 py-4 text-foreground/72')}>
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-1 text-sm font-semibold text-foreground">
            {t('desktop.priorityQuickSet.title')}
            {enforced && <span className="font-normal text-foreground/58">{t('desktop.nodeReview.priority.forcedLabel')}</span>}
          </div>
          <div className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground/76 data-[enforced=true]:text-foreground/44"
            data-enforced={Boolean(enforced)}>
            <span>{enforced && ownPriority === null ? '—' : normalizePushQueuePriority(priority)}</span>
            <span> / 9</span>
          </div>
        </div>
        <div className="pointer-events-auto">
          <DesktopPrioritySlider ariaLabel={t('desktop.priorityQuickSet.slider')} enforced={enforced}
            onChange={(value) => onPriorityChange?.(value)} value={priority} />
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground/62">
          <kbd className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold">0-9</kbd>
          <span>{t('desktop.priorityQuickSet.keyboardHint')}</span>
        </div>
      </section>
    </div>,
    document.body
  );
}
