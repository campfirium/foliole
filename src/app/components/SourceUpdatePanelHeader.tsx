import type { TopicTextAlternative } from '../../../lib/core/sync/topicTextState';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton } from '../../shared/ui';
import { TextAlternativeSelector } from '../../shared/ui/TextAlternativeSelector';

import type { DocumentComparisonMode } from './documentComparisonView';

export function SourceUpdatePanelHeader(props: {
  alternatives?: TopicTextAlternative[];
  selectedAlternativeId?: string | null;
  onSelectAlternative?: (id: string) => void;
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
          {t(props.comparisonMode === 'sync_alternative' ? 'desktop.sourceUpdate.alternative.hint' : props.comparisonMode === 'manual'
            ? 'desktop.sourceUpdate.manual.hint'
            : 'desktop.sourceUpdate.reviewHint')}
        </span>
      </div>
      {props.comparisonMode === 'sync_alternative' && props.onSelectAlternative ? (
        <TextAlternativeSelector alternatives={props.alternatives ?? []}
          selectedId={props.selectedAlternativeId ?? null} onSelect={props.onSelectAlternative} />
      ) : null}
      {props.sourceAvailable ? (
        <div aria-label={t('desktop.sourceUpdate.sourceSelector')} className="flex items-center gap-1" role="group">
          <AppButton
            active={props.comparisonSource === 'source'}
            className="data-[active=true]:bg-[var(--app-control-bg-hover-color)] data-[active=true]:text-foreground"
            onClick={() => props.onSourceChange('source')}
            variant="ghost"
          >
            {t(props.comparisonMode === 'sync_alternative' ? 'desktop.sourceUpdate.alternative.title' : 'desktop.sourceUpdate.sourceOption')}
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
