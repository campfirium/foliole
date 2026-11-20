import { CalendarDays, CircleCheck, FolderTree, ListChecks, Trash2, Upload } from 'lucide-react';

import type { SuperMemoMigrationStep as SavedStep } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppDialogTitle, SettingsNavigation, SettingsNavigationGroup, SettingsNavigationItem } from '../../../shared/ui';

const deletionStep = { id: 'deleted', label: 'deletedStep', Icon: Trash2 } as const;
const completionStep = { id: 'complete', label: 'importComplete', Icon: CircleCheck } as const;

const steps = [
  { id: 'load', label: 'loadStep', Icon: Upload },
  { id: 'structure', label: 'structureStep', Icon: FolderTree },
  { id: 'schedule', label: 'scheduleStep', Icon: CalendarDays },
  { id: 'grades', label: 'gradesStep', Icon: ListChecks }
] as const;

export type SuperMemoMigrationStep = Exclude<SavedStep, 'source' | 'confirm'>;

export function superMemoMigrationStepLabel(id: SuperMemoMigrationStep) {
  return `desktop.superMemoDrafts.${[...steps, completionStep, deletionStep].find(step => step.id === id)!.label}` as const;
}

export function SuperMemoMigrationSteps({ titleId, current, disabled, hasBatch, onChange }: {
  titleId: string; current: SuperMemoMigrationStep; disabled: boolean; hasBatch: boolean; onChange(step: SuperMemoMigrationStep): void;
}) {
  const t = useTranslation();
  function renderStep({ id, label, Icon }: (typeof steps)[number] | typeof completionStep | typeof deletionStep) {
    return (
      <SettingsNavigationItem key={id} icon={Icon} disabled={disabled} current={current === id ? 'step' : undefined}
        onClick={() => onChange(id)}>
        {t(`desktop.superMemoDrafts.${label}`)}
      </SettingsNavigationItem>
    );
  }
  return (
    <SettingsNavigation ariaLabel={t('desktop.superMemoDrafts.title')} navigationLabel={t('desktop.superMemoDrafts.steps')}
      footer={hasBatch ? renderStep(deletionStep) : undefined}
      title={<AppDialogTitle id={titleId} className="m-0 pl-[calc(var(--spacing)*2+1px)] text-settings-brand font-semibold">{t('desktop.superMemoDrafts.title')}</AppDialogTitle>}>
      <SettingsNavigationGroup>{steps.map(renderStep)}{hasBatch ? renderStep(completionStep) : null}</SettingsNavigationGroup>
    </SettingsNavigation>
  );
}
