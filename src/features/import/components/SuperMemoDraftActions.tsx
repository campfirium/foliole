import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppDialogActions } from '../../../shared/ui';

export function SuperMemoDraftActions({
  busy, showRules, canConvert, parameters, toggleRules, backToPreview, openParameters, convert
}: {
  busy: boolean; showRules: boolean; canConvert: boolean; parameters: boolean;
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
        <AppButton disabled={busy} onClick={() => convert()}>
          {t('desktop.superMemoDrafts.import')}
        </AppButton>
      </> : (
        <AppButton disabled={busy} onClick={() => openParameters()}>{t('desktop.superMemoDrafts.parameters')}</AppButton>
      )) : null}
    </AppDialogActions>
  );
}
