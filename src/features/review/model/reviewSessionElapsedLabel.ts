import type { useTranslation } from '../../../shared/localization/LocalizationProvider';

type ReviewSessionTranslate = ReturnType<typeof useTranslation>;

/** Flow summary duration shared by the desktop queue summary and the companion Flow menu. */
export function formatReviewSessionElapsed(elapsedMs: number, t: ReviewSessionTranslate) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return t('desktop.reviewSession.summary.justNow');
  const totalMinutes = Math.max(1, Math.round(elapsedMs / 60000));
  if (totalMinutes < 60) return `${totalMinutes} ${t('desktop.reviewSession.summary.minute')}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes
    ? `${hours} ${t('desktop.reviewSession.summary.hour')} ${minutes} ${t('desktop.reviewSession.summary.minute')}`
    : `${hours} ${t('desktop.reviewSession.summary.hour')}`;
}
