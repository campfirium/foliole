import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppDialogBody } from '../../../shared/ui';

const sections = ['materials', 'annotations'] as const;

export function SuperMemoConversionRules() {
  const t = useTranslation();

  return (
    <AppDialogBody className="min-h-0 overflow-y-auto">
      <div className="mx-auto grid max-w-prose gap-5">
        {sections.map(section => (
          <section key={section} className="grid gap-1.5">
            <h2 className="text-sm font-semibold">{t(`desktop.superMemoRules.${section}.title`)}</h2>
            <p className="text-sm leading-relaxed text-foreground/75">{t(`desktop.superMemoRules.${section}.body`)}</p>
          </section>
        ))}
      </div>
    </AppDialogBody>
  );
}
