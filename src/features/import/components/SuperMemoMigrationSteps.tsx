import { CalendarDays, CheckCheck, ClipboardList, FolderTree, ListChecks, Upload } from 'lucide-react';

import type { SuperMemoMigrationStep } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppDialogTitle, SettingsNavigation, SettingsNavigationGroup, SettingsNavigationItem } from '../../../shared/ui';

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

export function SuperMemoMigrationSteps({ titleId, current, disabled, onChange }: {
  titleId: string; current: SuperMemoMigrationStep; disabled: boolean; onChange(step: SuperMemoMigrationStep): void;
}) {
  const t = useTranslation();
  return (
    <SettingsNavigation alignTitleWithItems ariaLabel={t('desktop.superMemoDrafts.title')} navigationLabel={t('desktop.superMemoDrafts.steps')}
      title={<AppDialogTitle id={titleId} className="m-0 text-settings-brand font-semibold">{t('desktop.superMemoDrafts.title')}</AppDialogTitle>}>
      <SettingsNavigationGroup>
        {steps.map(({ id, label, Icon }) => (
          <SettingsNavigationItem key={id} icon={Icon} disabled={disabled} current={current === id ? 'step' : undefined}
            onClick={() => onChange(id)}>
            {t(`desktop.superMemoDrafts.${label}`)}
          </SettingsNavigationItem>
        ))}
      </SettingsNavigationGroup>
    </SettingsNavigation>
  );
}
