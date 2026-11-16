import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppDialogActions } from '../../../shared/ui';

export function SuperMemoDraftActions({
  busy, showRules, canConvert, parameters, directoryUpdate, toggleRules, backToPreview, openParameters, convert
}: {
  busy: boolean; showRules: boolean; canConvert: boolean; parameters: boolean;
  directoryUpdate?: { canConfirm: boolean; } | undefined;
  toggleRules(): void; backToPreview(): void; openParameters(): void; convert(): void;
}) {
  const t = useTranslation();
  return (
    <AppDialogActions>
      <AppButton disabled={busy} variant="ghost" onClick={() => toggleRules()}>
        {t(showRules ? 'desktop.superMemoRules.back' : 'desktop.superMemoRules.title')}
      </AppButton>
      {!showRules && canConvert ? (parameters ? <>
        <AppButton disabled={busy} variant="ghost" onClick={() => backToPreview()}>
          {t('desktop.superMemoDrafts.backToPreview')}
        </AppButton>
        <AppButton disabled={busy || directoryUpdate?.canConfirm === false} onClick={() => convert()}>
          {t(directoryUpdate ? 'desktop.superMemoDrafts.confirmUpdate' : 'desktop.superMemoDrafts.import')}
        </AppButton>
      </> : (
        <AppButton disabled={busy} onClick={() => openParameters()}>{t(directoryUpdate ? 'desktop.superMemoDrafts.updateByRules' : 'desktop.superMemoDrafts.parameters')}</AppButton>
      )) : null}
    </AppDialogActions>
  );
}
