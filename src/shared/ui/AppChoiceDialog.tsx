import { useEffect, useState } from 'react';

import { useTranslation } from '../localization/LocalizationProvider';

import { registerAppChoiceHandler, type AppChoiceOptions } from './appChoice';
import { AppButton } from './Button';
import { AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle } from './Dialog';

export function AppChoiceDialog() {
  const t = useTranslation();
  const [active, setActive] = useState<{
    options: AppChoiceOptions; resolve(value: string | null): void;
  } | null>(null);
  useEffect(() => registerAppChoiceHandler((options) => new Promise((resolve) => {
    setActive((previous) => { previous?.resolve(null); return { options, resolve }; });
  })), []);
  const close = (value: string | null) => { active?.resolve(value); setActive(null); };
  return (
    <AppDialog open={Boolean(active)} onOpenChange={(open) => { if (!open) close(null); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="task" className="w-[min(420px,calc(100vw-32px))]">
          <AppDialogTitle>{active?.options.title}</AppDialogTitle>
          <AppDialogBody>
            <AppDialogDescription>{active?.options.description}</AppDialogDescription>
            <div className="mt-4 flex flex-col gap-2">
              {active?.options.choices.map((choice) => (
                <AppButton key={choice.value} variant="default" onClick={() => close(choice.value)}>
                  {choice.label}
                </AppButton>
              ))}
            </div>
          </AppDialogBody>
          <AppDialogActions>
            <AppButton variant="ghost" onClick={() => close(null)}>{t('shared.confirm.cancel')}</AppButton>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
