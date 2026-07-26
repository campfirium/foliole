import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton } from '../../shared/ui';

import type { DocumentComparisonMode } from './documentComparisonView';

export function SourceUpdatePanelHeader(props: {
  comparisonMode: DocumentComparisonMode;
  comparisonSource: 'manual' | 'source';
  onSourceChange: (source: 'manual' | 'source') => void;
  sourceAvailable: boolean;
}) {
  const t = useTranslation();
  return (
    <header className="flex min-h-10 flex-none items-center justify-between gap-3 border-b border-foreground/[0.06] px-3 pl-[calc(1rem+var(--document-content-inline-padding))]">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-ui-sm font-medium text-foreground/55">{t('desktop.sourceUpdate.comparisonTitle')}</span>
        <span className="min-w-0 truncate text-ui-xs text-foreground/35">
          {t(props.comparisonMode === 'manual'
            ? 'desktop.sourceUpdate.manual.hint'
            : 'desktop.sourceUpdate.reviewHint')}
        </span>
      </div>
      {props.sourceAvailable ? (
        <div aria-label={t('desktop.sourceUpdate.sourceSelector')} className="flex items-center gap-1" role="group">
          <AppButton
            active={props.comparisonSource === 'source'}
            className="data-[active=true]:bg-[var(--app-control-bg-hover-color)] data-[active=true]:text-foreground"
            onClick={() => props.onSourceChange('source')}
            variant="ghost"
          >
            {t('desktop.sourceUpdate.sourceOption')}
          </AppButton>
          <AppButton
            active={props.comparisonSource === 'manual'}
            className="data-[active=true]:bg-[var(--app-control-bg-hover-color)] data-[active=true]:text-foreground"
            onClick={() => props.onSourceChange('manual')}
            variant="ghost"
          >
            {t('desktop.sourceUpdate.manualOption')}
          </AppButton>
        </div>
      ) : null}
    </header>
  );
}
