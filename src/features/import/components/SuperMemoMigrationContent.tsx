import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppDialogBody } from '../../../shared/ui';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoConfirmMigration } from './SuperMemoConfirmMigration';
import { SuperMemoEntryPreview, type useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import { superMemoMigrationStepLabel, type SuperMemoMigrationStep } from './SuperMemoMigrationSteps';
import { SuperMemoParameters } from './SuperMemoParameters';
import { SuperMemoSchedulePage } from './SuperMemoSchedulePage';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

function DraftSourcePicker({ disabled, name, onLoad }: { disabled: boolean; name?: string | undefined; onLoad(): void }) {
  const t = useTranslation();
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-foreground/15 px-4 py-3">
    <div className="min-w-0">
      <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.sourceTitle')}</h2>
      {name ? <p className="mt-1 break-all text-sm text-foreground/70">{name}</p> : null}
    </div>
    <AppButton disabled={disabled} onClick={onLoad}>{t(name ? 'desktop.superMemoDrafts.reloadSource' : 'desktop.superMemoDrafts.loadSource')}</AppButton>
  </div>;
}

export function SuperMemoMigrationContent({ model, current, selected, navigation, onLoad, onLoadNew, onSelect }: {
  model: ReturnType<typeof useSuperMemoDraft>; current: SuperMemoMigrationStep; selected: number[];
  navigation: ReturnType<typeof useSuperMemoPreviewNavigation>;
  onLoad(): void; onLoadNew(): void; onSelect(ids: number[]): void;
}) {
  const t = useTranslation();
  const { draft, source, busy, result, percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat } = model;
  const preview = draft?.preview;
  const update = preview?.directoryUpdate;
  return (
    <AppDialogBody className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">
      {!preview || current === 'load' || current === 'structure' || current === 'confirm' ? (
        <h3 className="text-base font-semibold">{t(superMemoMigrationStepLabel(current))}</h3>
      ) : null}
      {busy ? <p role="status">{t('desktop.superMemoDrafts.loading')}</p> : null}
      {current === 'load' ? <>
        <DraftSourcePicker disabled={busy} name={source?.name} onLoad={onLoad} />
        <details open className="rounded-lg border border-settings-divider p-4 text-sm">
          <summary className="cursor-pointer font-semibold">{t('desktop.superMemoDrafts.prepareTitle')}</summary>
          <p className="mt-2 max-w-prose text-foreground/75">{t('desktop.superMemoDrafts.prepareSource')}</p>
        </details>
        {update ? <p>{t('desktop.superMemoDrafts.existingBatch')}</p> : null}
        {update ? <AppButton className="self-start" disabled={busy} onClick={onLoadNew}>{t('desktop.superMemoDrafts.loadNewExport')}</AppButton> : null}
        {!busy ? <SuperMemoBatchAdjustments /> : null}
      </> : null}
      {current !== 'load' && !preview && !busy && !result ? <p>{t('desktop.superMemoDrafts.description')}</p> : null}
      {current === 'structure' && preview ? (
        <div className="min-h-0 flex-1"><SuperMemoEntryPreview navigation={navigation} preview={preview} elements={draft?.elements} /></div>
      ) : null}
      {preview && current === 'schedule' ? (
        <SuperMemoSchedulePage {...{ preview, percent, setPercent, busy }} />
      ) : null}
      {preview && (current === 'grades' || current === 'source') ? (
        <SuperMemoParameters step={current} preview={preview} {...{ percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat, busy }} />
      ) : null}
      {current === 'confirm' ? <SuperMemoConfirmMigration model={model} selected={selected} onSelect={onSelect} /> : null}
    </AppDialogBody>
  );
}
