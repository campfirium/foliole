import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export function SuperMemoConversionNote({ section }: { section: 'materials' | 'annotations' }) {
  const t = useTranslation();

  return (
    <div className="text-xs">
      <h3 className="font-medium text-foreground/75">{t(`desktop.superMemoRules.${section}.title`)}</h3>
      <p className="mt-1 leading-relaxed text-foreground/75">{t(`desktop.superMemoRules.${section}.body`)}</p>
    </div>
  );
}
