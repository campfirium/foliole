import type { EpubImportReleaseMode } from '../../../../lib/core/import/epub/epubReadingMode';
import { useTranslation, type Translate } from '../../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogActions,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../../shared/ui';

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

export function EpubImportReleaseModeChoice(props: {
  fileName: string;
  busy?: boolean;
  mobile?: boolean;
  description?: string;
  error?: string | null;
  onClose(): void;
  onSelect(mode: EpubImportReleaseMode): void;
}) {
  const t = useTranslation();
  return (
    <AppDialog onOpenChange={(open) => (!open && !props.busy ? props.onClose() : undefined)} open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(460px,calc(100vw-32px))]" layout="task">
          <AppDialogTitle className="text-base font-semibold">{t('desktop.epubImport.mode.title')}</AppDialogTitle>
          <AppDialogBody className="space-y-3">
            <p className="text-[13px] text-foreground/65">{props.fileName}</p>
            <AppDialogDescription className="text-[13px] leading-5 text-foreground/70">
              {props.description ?? t('desktop.epubImport.mode.description')}
            </AppDialogDescription>
            <div aria-label={t('desktop.epubImport.mode.aria')} className="grid gap-2">
              {MODE_OPTIONS.map((option) => (
                <button
                  className="rounded-md border border-border-subtle p-3 text-left transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  key={option.mode}
                  onClick={() => props.onSelect(option.mode)}
                  disabled={props.busy}
                  type="button"
                >
                  <span className="block text-[13px] font-medium text-foreground">{t(option.labelKey)}</span>
                  <span className="mt-1 block text-[12px] text-foreground/55">{t(option.suitabilityKey)}</span>
                  <span className="mt-1 block text-[12px] leading-5 text-foreground/60">{t(option.descriptionKey)}</span>
                </button>
              ))}
            </div>
            {props.error ? <p role="alert" className="text-sm text-destructive">{props.error}</p> : null}
          </AppDialogBody>
          <AppDialogActions>
            <AppButton className={props.mobile ? 'min-h-11' : undefined} disabled={props.busy} onClick={() => props.onClose()} variant="ghost">{t('common.cancel')}</AppButton>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
