import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppDialogActions } from '../../../shared/ui';

export function SuperMemoDraftActions({
  busy, canConvert, parameters, directoryUpdate, backToPreview, openParameters, convert
}: {
  busy: boolean; canConvert: boolean; parameters: boolean;
  directoryUpdate?: { canConfirm: boolean; } | undefined;
  backToPreview(): void; openParameters(): void; convert(): void;
}) {
  const t = useTranslation();
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
