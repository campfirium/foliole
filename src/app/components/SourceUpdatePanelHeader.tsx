import { useTranslation } from '../../shared/localization/LocalizationProvider';

export function SourceUpdatePanelHeader() {
  const t = useTranslation();

  return (
    <header className="flex h-10 flex-none items-center border-b border-foreground/[0.06] pl-[calc(1rem+var(--document-content-inline-padding))] pr-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-[12px] font-medium text-foreground/45">{t('desktop.sourceUpdate.reviewTitle')}</span>
        <span className="min-w-0 truncate text-[11px] font-normal text-foreground/30">
          {t('desktop.sourceUpdate.reviewHint')}
        </span>
      </div>
    </header>
  );
}
