import { useTranslation } from '../../shared/localization/LocalizationProvider';

type Translate = ReturnType<typeof useTranslation>;

const SUMMARY_CARD_CLASS_NAME = 'rounded-md bg-[var(--app-floating-muted-bg)] px-3 py-2';

function formatHighlightTrend(t: Translate, currentHighlightCount: number, updatedHighlightCount: number) {
  if (currentHighlightCount === updatedHighlightCount) {
    return t('desktop.sourceUpdate.summary.highlightsStay', { count: updatedHighlightCount });
  }
  if (updatedHighlightCount > currentHighlightCount) {
    return t('desktop.sourceUpdate.summary.highlightsGrow', { current: currentHighlightCount, updated: updatedHighlightCount });
  }
  return t('desktop.sourceUpdate.summary.highlightsShrink', { current: currentHighlightCount, updated: updatedHighlightCount });
}

function formatHighlightCount(t: Translate, count: number) {
  return t(count === 1 ? 'desktop.sourceUpdate.summary.highlightCount.one' : 'desktop.sourceUpdate.summary.highlightCount.many', { count });
}

export function SourceUpdateSummaryBar(props: {
  currentHighlightCount: number;
  updatedHighlightCount: number;
}) {
  const t = useTranslation();
  return (
    <section className="grid grid-cols-2 gap-3 border-b border-border px-4 py-3">
      <div className={SUMMARY_CARD_CLASS_NAME}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60">{t('desktop.sourceUpdate.summary.current')}</p>
        <p className="mt-1 text-sm font-medium text-foreground">{formatHighlightCount(t, props.currentHighlightCount)}</p>
      </div>
      <div className={SUMMARY_CARD_CLASS_NAME}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60">{t('desktop.sourceUpdate.summary.incoming')}</p>
        <p className="mt-1 text-sm font-medium text-foreground">{formatHighlightTrend(t, props.currentHighlightCount, props.updatedHighlightCount)}</p>
      </div>
    </section>
  );
}
