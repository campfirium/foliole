import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

export function CompanionPdfResumeNotice(props: { accept(): void; dismiss(): void }) {
  const t = useTranslation();
  return (
    <aside className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.5rem)] z-workspace-overlay mx-auto flex max-w-sm flex-wrap items-center gap-2 rounded-lg border border-companion-divider bg-companion-base p-3 shadow-md">
      <p role="status" className="w-full text-sm">{t('desktop.document.readingResume.available')}</p>
      <AppButton className="min-h-11" onClick={props.accept}>{t('desktop.document.readingResume.jump')}</AppButton>
      <AppButton className="min-h-11" onClick={props.dismiss} variant="ghost">{t('companion.reading.alternative.dismiss')}</AppButton>
    </aside>
  );
}
