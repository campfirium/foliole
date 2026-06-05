import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';
import type { EpubImportReleaseMode } from '../hooks/epubImportReleaseMode';
import {
  closeEpubImportReleaseModeDialog,
  useEpubImportReleaseModeDialogSnapshot
} from '../hooks/epubImportReleaseModeDialogStore';

const MODE_OPTIONS: Array<{
  descriptionKey: Parameters<Translate>[0];
  labelKey: Parameters<Translate>[0];
  suitabilityKey: Parameters<Translate>[0];
  mode: EpubImportReleaseMode;
}> = [
  {
    descriptionKey: 'desktop.epubImport.mode.sequential.description',
    labelKey: 'desktop.epubImport.mode.sequential.label',
    suitabilityKey: 'desktop.epubImport.mode.sequential.suitability',
    mode: 'sequential'
  },
  {
    descriptionKey: 'desktop.epubImport.mode.free.description',
    labelKey: 'desktop.epubImport.mode.free.label',
    suitabilityKey: 'desktop.epubImport.mode.free.suitability',
    mode: 'free'
  }
];

export function EpubImportReleaseModeDialog() {
  const t = useTranslation();
  const snapshot = useEpubImportReleaseModeDialogSnapshot();
  if (!snapshot) {
    return null;
  }
  return (
    <AppDialog onOpenChange={(open) => (!open ? closeEpubImportReleaseModeDialog(null) : undefined)} open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(460px,calc(100vw-32px))] p-5">
          <div className="space-y-1">
            <AppDialogTitle className="text-base font-semibold">{t('desktop.epubImport.mode.title')}</AppDialogTitle>
            <p className="text-[13px] text-foreground/65">{snapshot.file.fileName}</p>
          </div>
          <div className="mt-4 space-y-3">
            <AppDialogDescription className="text-[13px] leading-5 text-foreground/70">
              {t('desktop.epubImport.mode.description')}
            </AppDialogDescription>
            <div aria-label={t('desktop.epubImport.mode.aria')} className="grid gap-2">
              {MODE_OPTIONS.map((option) => (
                <button
                  className="rounded-md border border-border-subtle p-3 text-left transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  key={option.mode}
                  onClick={() => closeEpubImportReleaseModeDialog(option.mode)}
                  type="button"
                >
                  <span className="block text-[13px] font-medium text-foreground">{t(option.labelKey)}</span>
                  <span className="mt-1 block text-[12px] text-foreground/55">{t(option.suitabilityKey)}</span>
                  <span className="mt-1 block text-[12px] leading-5 text-foreground/60">{t(option.descriptionKey)}</span>
                </button>
              ))}
            </div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
