import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppDialogActions } from '../../../shared/ui';

export function SuperMemoDraftActions({
  busy, canConvert, parameters, showPreviewFooter, directoryUpdate, backToPreview, openParameters, convert
}: {
  busy: boolean; canConvert: boolean; parameters: boolean; showPreviewFooter: boolean;
  directoryUpdate?: { canConfirm: boolean; } | undefined;
  backToPreview(): void; openParameters(): void; convert(): void;
}) {
  const t = useTranslation();
  if (showPreviewFooter) {
    return (
      <footer className="flex shrink-0 items-center justify-end gap-2 px-6 pb-6">
        <p role="note" className="flex min-h-8 min-w-0 max-w-[72ch] items-center text-end text-xs leading-4 text-foreground/65">{t('desktop.superMemoDrafts.conversionNote')}</p>
        {canConvert ? <AppButton className="shrink-0" disabled={busy} onClick={openParameters}>
          {t('desktop.superMemoDrafts.parameters')}
        </AppButton> : null}
      </footer>
    );
  }
  if (!canConvert) return null;
  return (
    <AppDialogActions>
      {(parameters ? <>
        <AppButton disabled={busy} variant="ghost" onClick={() => backToPreview()}>
          {t('desktop.superMemoDrafts.backToPreview')}
        </AppButton>
        <AppButton disabled={busy || directoryUpdate?.canConfirm === false} onClick={() => convert()}>
          {t(directoryUpdate ? 'desktop.superMemoDrafts.confirmUpdate' : 'desktop.superMemoDrafts.import')}
        </AppButton>
      </> : (
        <AppButton disabled={busy} onClick={() => openParameters()}>{t(directoryUpdate ? 'desktop.superMemoDrafts.updateByRules' : 'desktop.superMemoDrafts.parameters')}</AppButton>
      ))}
    </AppDialogActions>
  );
}
