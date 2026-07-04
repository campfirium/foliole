import { useTranslation } from '../../shared/localization/LocalizationProvider';

type Translate = ReturnType<typeof useTranslation>;

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
    <section className="flex h-10 flex-none items-center justify-between border-b border-border px-4 text-xs text-foreground/60">
      <span>{formatHighlightCount(t, props.currentHighlightCount)}</span>
      <span>{formatHighlightTrend(t, props.currentHighlightCount, props.updatedHighlightCount)}</span>
    </section>
  );
}
