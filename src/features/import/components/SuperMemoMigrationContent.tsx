import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppDialogBody } from '../../../shared/ui';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoConfirmMigration } from './SuperMemoConfirmMigration';
import { SuperMemoEntryPreview, type useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import { SuperMemoGradesPage } from './SuperMemoGradeSettings';
import { SuperMemoLoadPage } from './SuperMemoLoadPage';
import { superMemoMigrationStepLabel, type SuperMemoMigrationStep } from './SuperMemoMigrationSteps';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';
import { SuperMemoSchedulePage } from './SuperMemoSchedulePage';
import { SuperMemoSourcePage } from './SuperMemoSourcePage';
import { SuperMemoStructurePage } from './SuperMemoStructurePage';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

export function SuperMemoMigrationContent({ model, current, selected, navigation, onLoad, onLoadNew, onViewSource, onSelect }: {
  model: ReturnType<typeof useSuperMemoDraft>; current: SuperMemoMigrationStep; selected: number[];
  navigation: ReturnType<typeof useSuperMemoPreviewNavigation>;
  onLoad(): void; onLoadNew(): void; onViewSource(): void; onSelect(ids: number[]): void;
}) {
  const t = useTranslation();
  const { draft, busy, result, percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat } = model;
  const preview = draft?.preview;
  const selection = model.selection;
  return (
    <AppDialogBody className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">
      {!preview || current === 'load' || current === 'structure' || current === 'confirm' ? (
        <h3 className="text-base font-semibold">{t(superMemoMigrationStepLabel(current))}</h3>
      ) : null}
      {busy ? <p role="status">{t('desktop.superMemoDrafts.loading')}</p> : null}
      {current === 'load' ? <SuperMemoLoadPage {...{ model, onLoad, onLoadNew, onViewSource }} /> : null}
      {current !== 'load' && !preview && !busy && !result && !selection ? <p>{t('desktop.superMemoDrafts.description')}</p> : null}
      {current === 'structure' && preview ? (
        draft && !preview.directoryUpdate ? <SuperMemoStructurePage preview={preview} elements={draft.elements}
          navigation={navigation} busy={busy} onChange={model.changeFolder} /> :
          <div className="min-h-0 flex-1"><SuperMemoEntryPreview navigation={navigation} preview={preview} elements={draft?.elements} /></div>
      ) : null}
      {current === 'grades' && selection ? (
        <SuperMemoGradesPage preview={preview} percent={percent} disabled={busy} value={gradeMap}
          onChange={next => void changeGrades(next)} />
      ) : null}
      {preview && current === 'schedule' ? (
        <SuperMemoSchedulePage {...{ preview, percent, setPercent, busy }} />
      ) : null}
      {!preview && selection && current === 'schedule' ? (
        selection.panel?.batchId
          ? <SuperMemoBatchAdjustments preferredBatchId={selection.panel.batchId} />
          : <SuperMemoPreviewOptionFields compact percent={percent} onChange={setPercent} disabled={busy} />
      ) : null}
      {current === 'source' && selection ? (
        <SuperMemoSourcePage preview={preview} elements={draft?.elements} value={sourceFormat} disabled={busy}
          onChange={changeSourceFormat} />
      ) : null}
      {current === 'confirm' && !result && preview?.rows.some(row => row.structure && row.outcome !== 'skipped' &&
        row.structure.parentId !== row.parentId) ? (
        <p role="note" className="text-sm">{t('desktop.superMemoDrafts.structureConfirmNotice')}</p>
      ) : null}
      {current === 'confirm' ? <SuperMemoConfirmMigration model={model} selected={selected} onSelect={onSelect} /> : null}
      {current !== 'load' && selection && !preview && !result && !busy ? (
        <AppButton className="self-start" onClick={() => void model.prepareRememberedSource()}>
          {t('desktop.superMemoDrafts.preparePreview')}
        </AppButton>
      ) : null}
    </AppDialogBody>
  );
}
