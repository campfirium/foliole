import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export function SuperMemoConversionNote({ section }: { section: 'materials' | 'annotations' }) {
  const t = useTranslation();

  return (
    <div className="border-t border-foreground/10 px-3 py-2 text-xs">
      <h3 className="font-medium">{t(`desktop.superMemoRules.${section}.title`)}</h3>
      <p className="mt-1 leading-relaxed text-foreground/75">{t(`desktop.superMemoRules.${section}.body`)}</p>
    </div>
  );
}
