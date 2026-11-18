import { CalendarDays, CheckCheck, ClipboardList, FolderTree, ListChecks, Upload } from 'lucide-react';

import type { SuperMemoMigrationStep } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, settingsSidebarItemClassName } from '../../../shared/ui';

const steps = [
  { id: 'load', label: 'loadStep', Icon: Upload },
  { id: 'structure', label: 'structureStep', Icon: FolderTree },
  { id: 'schedule', label: 'scheduleStep', Icon: CalendarDays },
  { id: 'grades', label: 'gradesStep', Icon: ListChecks },
  { id: 'source', label: 'sourceStep', Icon: ClipboardList },
  { id: 'confirm', label: 'confirmStep', Icon: CheckCheck }
] as const;

export type { SuperMemoMigrationStep } from '../../../../lib/platform/nativeSuperMemoImportContract';

export function superMemoMigrationStepLabel(id: SuperMemoMigrationStep) {
  return `desktop.superMemoDrafts.${steps.find(step => step.id === id)!.label}` as const;
}

export function SuperMemoMigrationSteps({ current, disabled, onChange }: {
  current: SuperMemoMigrationStep; disabled: boolean; onChange(step: SuperMemoMigrationStep): void;
}) {
  const t = useTranslation();
  return (
    <nav aria-label={t('desktop.superMemoDrafts.steps')} className="flex shrink-0 gap-1 overflow-auto border-b border-settings-divider bg-settings-sidebar p-3 sm:flex-col sm:border-b-0 sm:border-r">
      {steps.map(({ id, label, Icon }) => (
        <AppButton key={id} variant="ghost" disabled={disabled} aria-current={current === id ? 'step' : undefined}
          className={settingsSidebarItemClassName(current === id, 'justify-start whitespace-nowrap')}
          onClick={() => onChange(id)}>
          <Icon aria-hidden className="size-4 shrink-0" />
          {t(`desktop.superMemoDrafts.${label}`)}
        </AppButton>
      ))}
    </nav>
  );
}
