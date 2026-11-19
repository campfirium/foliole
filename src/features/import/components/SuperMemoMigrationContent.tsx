import type { SuperMemoXmlBody } from '../../../../lib/core/import/superMemoXmlDraft';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { SuperMemoDeletedPage } from './SuperMemoDeletedPage';
import type { useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import { SuperMemoGradeSettings } from './SuperMemoGradeSettings';
import { SuperMemoLoadPage } from './SuperMemoLoadPage';
import { superMemoMigrationStepLabel, type SuperMemoMigrationStep } from './SuperMemoMigrationSteps';
import { SuperMemoReferenceSettings } from './SuperMemoReferenceSettings';
import { SuperMemoSchedulePage } from './SuperMemoSchedulePage';
import { SuperMemoStructurePage } from './SuperMemoStructurePage';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

export function SuperMemoMigrationContent({ model, current, navigation, sourceContent, onLoad, onLoadNew }: {
  model: ReturnType<typeof useSuperMemoDraft>; current: SuperMemoMigrationStep;
  navigation: ReturnType<typeof useSuperMemoPreviewNavigation>;
  sourceContent: SuperMemoXmlBody[] | null | undefined;
  onLoad(): void; onLoadNew(): void;
}) {
  const t = useTranslation();
  const { draft, busy, result, percent, setPercent, gradeMap, changeGrades } = model;
  const preview = draft?.preview;
  const selection = model.selection;
  const fillsPane = current === 'structure' || (current === 'schedule' && preview);
  return (
    <div className={`flex min-w-0 flex-col gap-4 px-settings-panel-x ${fillsPane ? 'h-full' : ''}`}>
      <h3 className="shrink-0 text-ui-lg font-semibold">{t(
        current === 'schedule' ? 'desktop.superMemoDrafts.scheduleTitle' : superMemoMigrationStepLabel(current)
      )}</h3>
      {current === 'load' ? <SuperMemoLoadPage {...{ model, onLoad, onLoadNew }} /> : null}
      {current === 'deleted' ? <SuperMemoDeletedPage /> : null}
      {current !== 'load' && !preview && !busy && !result && !selection ? <p>{t('desktop.superMemoDrafts.description')}</p> : null}
      {current === 'structure' && draft ? (
        <>
          <p className="shrink-0 text-sm text-foreground/65">{t('desktop.superMemoDrafts.structureReview')}</p>
          <SuperMemoStructurePage key={selection?.filePath} preview={draft.preview} elements={draft.elements}
            loaded={sourceContent}
            navigation={navigation} busy={busy} onChange={model.changeFolder} />
        </>
      ) : null}
      {current === 'grades' && selection ? (
        <div className="grid min-w-0 gap-4 text-sm [@media(min-height:880px)]:gap-5">
          <SuperMemoGradeSettings disabled={busy} value={gradeMap} onChange={next => void changeGrades(next)} />
          <SuperMemoReferenceSettings mapping={model.referenceMap} disabled={busy} onChange={model.changeReferences} />
        </div>
      ) : null}
      {preview && current === 'schedule' ? (
        <SuperMemoSchedulePage {...{ preview, percent, setPercent, busy }} />
      ) : null}
    </div>
  );
}
