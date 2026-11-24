import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { SettingsRow, SettingsSection } from '../../../shared/ui';
import { SUPER_MEMO_DEMO_COLLECTION_NAME } from '../model/superMemoDemoCollection';

import { SuperMemoGradeSettings } from './SuperMemoGradeSettings';
import { superMemoMigrationStepLabel } from './SuperMemoMigrationSteps';
import { SuperMemoPriorityPage } from './SuperMemoPriorityPage';
import { SuperMemoSchedulePage } from './SuperMemoSchedulePage';
import { SuperMemoStructurePage } from './SuperMemoStructurePage';
import type { SuperMemoDemoWalkthrough } from './useSuperMemoDemoWalkthrough';

function SampleSource({ model }: { model: SuperMemoDemoWalkthrough }) {
  const t = useTranslation();
  const count = (type: string) => model.elements.filter(element => element.sourceType === type && element.title).length;
  return (
    <SettingsSection className="mb-0 !pt-0 before:!hidden">
      <SettingsRow className="items-center !px-0 before:!inset-x-0"
        title={t('settings.demoPreview.superMemo.sample.title')}
        description={<>
          <span className="block font-medium text-foreground">{SUPER_MEMO_DEMO_COLLECTION_NAME}</span>
          <span className="block">{t('settings.demoPreview.superMemo.sample.description', {
            topics: count('Topic'), items: count('Item')
          })}</span>
        </>} />
    </SettingsSection>
  );
}

export function SuperMemoDemoContent({ model }: { model: SuperMemoDemoWalkthrough }) {
  const t = useTranslation();
  const { step, preview } = model;
  if (step === 'complete') {
    return (
      <div className="flex min-w-0 flex-col gap-4 px-settings-panel-x">
        <h3 className="text-ui-lg font-semibold">{t('settings.demoPreview.superMemo.done.title')}</h3>
        <p className="text-sm leading-relaxed text-foreground/75">
          {t('settings.demoPreview.superMemo.done.description')}
        </p>
      </div>
    );
  }
  const fillsPane = step === 'structure' || step === 'schedule';
  return (
    <div className={`flex min-w-0 flex-col gap-4 px-settings-panel-x ${fillsPane ? 'h-full' : ''}`}>
      <h3 className="shrink-0 text-ui-lg font-semibold">{t(
        step === 'schedule' ? 'desktop.superMemoDrafts.scheduleTitle' : superMemoMigrationStepLabel(step)
      )}</h3>
      {step === 'load' ? <SampleSource model={model} /> : null}
      {step === 'structure' ? <>
        <p className="shrink-0 text-sm text-foreground/65">{t('desktop.superMemoDrafts.structureReview')}</p>
        <SuperMemoStructurePage preview={preview} elements={model.elements} loaded={model.elements}
          navigation={model.navigation} busy={false} onChange={model.changeFolder} />
      </> : null}
      {step === 'schedule' ? <SuperMemoSchedulePage preview={preview} percent={model.percent}
        setPercent={model.setPercent} busy={false} /> : null}
      {step === 'priority' ? <SuperMemoPriorityPage boundaries={model.boundaries} paired busy={false}
        onChange={model.setBoundaries} /> : null}
      {step === 'grades' ? <div className="text-sm">
        <SuperMemoGradeSettings disabled={false} value={model.gradeMap} onChange={model.setGradeMap} />
      </div> : null}
    </div>
  );
}
