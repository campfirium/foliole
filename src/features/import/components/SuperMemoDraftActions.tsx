import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { SettingsButton } from '../../../shared/ui';
import { settingsDialogFooterInset } from '../../../shared/ui/settingsDialogBounds';

import type { SuperMemoMigrationStep } from './SuperMemoMigrationSteps';

const nextStep = {
  load: 'structure', structure: 'schedule', schedule: 'grades'
} as const;

const previousStep = {
  structure: 'load', schedule: 'structure', grades: 'schedule', complete: 'grades'
} as const;

export function SuperMemoDraftActions({ step, busy, importing = false, updating = false, canProceed, hasPreview, referenceMapValid = true, navigate, convert }: {
  step: SuperMemoMigrationStep; busy: boolean; canProceed: boolean; hasPreview: boolean;
  importing?: boolean;
  updating?: boolean;
  referenceMapValid?: boolean;
  navigate(step: SuperMemoMigrationStep): void; convert(): void;
}) {
  const t = useTranslation();
  if (step === 'deleted') return null;
  const finalStep = step === 'grades';
  const complete = step === 'complete';
  const previous = step === 'load' ? undefined : previousStep[step];
  const backLabel = t(complete ? 'desktop.superMemoDrafts.backToImportSettings' : 'desktop.superMemoDrafts.previous');
  const nextLabel = t('desktop.superMemoDrafts.parameters');
  return (
    <div className={`app-scrollbar shrink-0 overflow-hidden px-7 pt-4 [scrollbar-gutter:stable] ${settingsDialogFooterInset}`}>
      <div className="flex items-end justify-between gap-4 px-settings-panel-x">
        <p className="min-w-0 self-center text-xs leading-relaxed text-foreground/65">
          {t(complete ? 'desktop.superMemoDrafts.completedAdjustmentNote'
            : 'desktop.superMemoDrafts.adjustmentNote')}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {previous ? <SettingsButton className="w-9 px-0" disabled={busy}
            aria-label={backLabel} title={backLabel} onClick={() => navigate(previous)}>
            <ChevronLeft aria-hidden="true" className="size-[18px]" />
          </SettingsButton> : null}
          {finalStep && hasPreview ? <SettingsButton className="shrink-0" loading={importing}
            loadingLabel={t(updating ? 'desktop.superMemoDrafts.updating' : 'desktop.superMemoDrafts.importing')}
            disabled={busy || !referenceMapValid} onClick={convert}>
            {t(updating ? 'desktop.superMemoDrafts.update' : 'desktop.superMemoDrafts.import')}
          </SettingsButton> : !finalStep && step !== 'complete' && canProceed ? <SettingsButton className="w-9 px-0" disabled={busy} aria-label={nextLabel} title={nextLabel}
            onClick={() => navigate(nextStep[step])}>
            <ChevronRight aria-hidden="true" className="size-[18px]" />
          </SettingsButton> : null}
        </div>
      </div>
    </div>
  );
}
