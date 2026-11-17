import { ArrowRight } from 'lucide-react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppDialogActions } from '../../../shared/ui';

import type { SuperMemoMigrationStep } from './SuperMemoMigrationSteps';

const nextStep = {
  load: 'structure', structure: 'schedule', schedule: 'grades', grades: 'source', source: 'confirm'
} as const;

export function SuperMemoDraftActions({ step, busy, canConvert, directoryUpdate, navigate, convert }: {
  step: SuperMemoMigrationStep; busy: boolean; canConvert: boolean;
  directoryUpdate?: { canConfirm: boolean } | undefined;
  navigate(step: SuperMemoMigrationStep): void; convert(): void;
}) {
  const t = useTranslation();
  if (!canConvert) return null;
  return (
    <AppDialogActions className="shrink-0 flex-wrap border-t border-settings-divider px-4 py-3 sm:px-6">
      {step === 'structure' && !directoryUpdate ? <p role="note" className="mr-auto min-w-0 max-w-[72ch] flex-1 text-xs leading-4 text-foreground/70">
        {t('desktop.superMemoDrafts.conversionNote')}
      </p> : null}
      {step === 'confirm' ? <AppButton variant="emphasis" disabled={busy || directoryUpdate?.canConfirm === false} onClick={convert}>
        {t(directoryUpdate ? 'desktop.superMemoDrafts.confirmUpdate' : 'desktop.superMemoDrafts.import')}
      </AppButton> : <AppButton variant="emphasis" disabled={busy} onClick={() => navigate(directoryUpdate && step === 'load' ? 'confirm' : nextStep[step])}>
        {t(directoryUpdate && step === 'load' ? 'desktop.superMemoDrafts.updateByRules' :
          step === 'structure' ? 'desktop.superMemoDrafts.parameters' : 'desktop.superMemoDrafts.continueStep')}
        <ArrowRight aria-hidden className="size-4" />
      </AppButton>}
    </AppDialogActions>
  );
}
