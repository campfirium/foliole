import { CalendarDays, FolderTree, ListChecks, Trash2, Upload } from 'lucide-react';

import type { SuperMemoMigrationStep as SavedStep } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppDialogTitle, SettingsNavigation, SettingsNavigationGroup, SettingsNavigationItem } from '../../../shared/ui';

const steps = [
  { id: 'load', label: 'loadStep', Icon: Upload },
  { id: 'structure', label: 'structureStep', Icon: FolderTree },
  { id: 'schedule', label: 'scheduleStep', Icon: CalendarDays },
  { id: 'grades', label: 'gradesStep', Icon: ListChecks },
  { id: 'deleted', label: 'deletedStep', Icon: Trash2 }
] as const;

export type SuperMemoMigrationStep = Exclude<SavedStep, 'source' | 'confirm'>;

export function superMemoMigrationStepLabel(id: SuperMemoMigrationStep) {
  return `desktop.superMemoDrafts.${steps.find(step => step.id === id)!.label}` as const;
}

export function SuperMemoMigrationSteps({ titleId, current, disabled, hasBatch, onChange }: {
  titleId: string; current: SuperMemoMigrationStep; disabled: boolean; hasBatch: boolean; onChange(step: SuperMemoMigrationStep): void;
}) {
  const t = useTranslation();
  return (
    <SettingsNavigation ariaLabel={t('desktop.superMemoDrafts.title')} navigationLabel={t('desktop.superMemoDrafts.steps')}
      title={<AppDialogTitle id={titleId} className="m-0 pl-[calc(var(--spacing)*2+1px)] text-settings-brand font-semibold">{t('desktop.superMemoDrafts.title')}</AppDialogTitle>}>
      <SettingsNavigationGroup>
        {steps.filter(({ id }) => id !== 'deleted' || hasBatch).map(({ id, label, Icon }) => (
          <SettingsNavigationItem key={id} icon={Icon} disabled={disabled} current={current === id ? 'step' : undefined}
            onClick={() => onChange(id)}>
            {t(`desktop.superMemoDrafts.${label}`)}
          </SettingsNavigationItem>
        ))}
      </SettingsNavigationGroup>
    </SettingsNavigation>
  );
}
