import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export function SuperMemoImportCompletePage() {
  const t = useTranslation();
  return (
    <div className="flex flex-col gap-4 text-sm leading-relaxed text-foreground/75">
      <p className="font-medium text-foreground">{t('desktop.superMemoDrafts.completedIntro')}</p>
      <p>{t('desktop.superMemoDrafts.completedIdentity')}</p>
      <p>{t('desktop.superMemoDrafts.completedProtection')}</p>
      <p>{t('desktop.superMemoDrafts.completedMigration')}</p>
      <p>{t('desktop.superMemoDrafts.completedPreview')}</p>
    </div>
  );
}
