import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { SettingsButton } from '../../../shared/ui';

import type { SuperMemoMigrationStep } from './SuperMemoMigrationSteps';

const nextStep = {
  load: 'structure', structure: 'schedule', schedule: 'grades', grades: 'source', source: 'confirm'
} as const;

export function SuperMemoDraftActions({ step, busy, canProceed, hasPreview, directoryUpdate, navigate, convert }: {
  step: SuperMemoMigrationStep; busy: boolean; canProceed: boolean; hasPreview: boolean;
  directoryUpdate?: { canConfirm: boolean } | undefined;
  navigate(step: SuperMemoMigrationStep): void; convert(): void;
}) {
  const t = useTranslation();
  if (step === 'confirm' ? !hasPreview : !canProceed) return null;
  return (
    <div className="app-scrollbar shrink-0 overflow-hidden px-7 pb-14 pt-4 [scrollbar-gutter:stable]">
      <div className="flex justify-end px-settings-panel-x">
        {step === 'confirm' ? <SettingsButton disabled={busy || directoryUpdate?.canConfirm === false} onClick={convert}>
          {t(directoryUpdate ? 'desktop.superMemoDrafts.confirmUpdate' : 'desktop.superMemoDrafts.import')}
        </SettingsButton> : <SettingsButton disabled={busy} onClick={() => navigate(directoryUpdate && step === 'load' ? 'confirm' : nextStep[step])}>
          {t(directoryUpdate && step === 'load' ? 'desktop.superMemoDrafts.updateByRules' :
            'desktop.superMemoDrafts.parameters')}
        </SettingsButton>}
      </div>
    </div>
  );
}
