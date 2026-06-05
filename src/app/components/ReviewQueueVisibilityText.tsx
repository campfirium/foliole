import { useTranslation } from '../../shared/localization/LocalizationProvider';

import type { ReviewQueueVisibility } from './reviewQueueVisibility';

export function ReviewQueueVisibilityText({ visibility }: { visibility: ReviewQueueVisibility }) {
  const t = useTranslation();
  return (
    <div aria-label={t('desktop.reviewQueue.visibility')} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] text-foreground/60">
      <span>{t('desktop.reviewQueue.live', { label: visibility.currentQueueLabel })}</span>
      <span>{t('desktop.reviewQueue.reviewItems', { count: visibility.fsrsQueueCount })}</span>
      <span>{t('desktop.reviewQueue.reading', { count: visibility.readingQueueCount })}</span>
      <span>
        {t('desktop.reviewQueue.mix', { fsrs: visibility.queueMixRatioFsrs, reading: visibility.queueMixRatioReading })}
      </span>
    </div>
  );
}
