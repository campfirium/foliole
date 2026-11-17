import { X } from 'lucide-react';
import { useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { loadSuperMemoGradeMap } from '../../../shared/platform/import/superMemoImportRuntimeRepository';
import {
  AppButton, AppDialog, AppDialogBody, AppDialogClose, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle, SettingsControlSlot, SettingsRow
} from '../../../shared/ui';
import { useDismissibleSurface } from '../../../shared/ui/useDismissibleSurface';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoDirectoryUpdate, SuperMemoResult } from './SuperMemoDirectoryUpdate';
import { SuperMemoDraftActions } from './SuperMemoDraftActions';
import { SuperMemoDraftTable } from './SuperMemoDraftTable';
import { SuperMemoEntryPreview } from './SuperMemoEntryPreview';
import { SuperMemoGradeSettings } from './SuperMemoGradeSettings';
import { SuperMemoLoadNotice } from './SuperMemoLoadNotice';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';
import { SuperMemoSourceSettings } from './SuperMemoSourceSettings';
import { SuperMemoWithdrawals } from './SuperMemoWithdrawals';
import { useSuperMemoDraft } from './useSuperMemoDraft';

function SuperMemoParameters({ preview, percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat, busy }: {
  preview: NonNullable<ReturnType<typeof useSuperMemoDraft>['draft']>['preview'];
  percent: number; setPercent(value: number): void; gradeMap: SuperMemoGradeMap;
  changeGrades(value: SuperMemoGradeMap): Promise<void>; sourceFormat: SuperMemoSourceFormat;
  changeSourceFormat(value: SuperMemoSourceFormat): Promise<void>; busy: boolean;
}) {
  const t = useTranslation();
  return (<div className="grid gap-4">
    <p className="rounded-md bg-foreground/5 px-3 py-2 text-sm text-foreground/70">
      {t('desktop.superMemoDrafts.reapplyNote')}
    </p>
    <div className="grid items-start gap-4 min-[850px]:grid-cols-[3fr_2fr]">
      <section className="grid gap-3 rounded-lg border border-foreground/15 p-4">
        <h3 className="text-sm font-medium">{t('desktop.superMemoDrafts.scheduleTitle')}</h3>
        <SuperMemoPreviewOptionFields percent={percent} onChange={setPercent} />
        <SuperMemoDraftTable preview={preview} percent={percent} />
        <p className="text-xs text-foreground/65">
          {t(preview.pairedCollection ? 'desktop.superMemoDrafts.pairedLimitations' : 'desktop.superMemoDrafts.xmlLimitations')}
        </p>
      </section>
      <SuperMemoGradeSettings disabled={busy} value={gradeMap} onChange={next => void changeGrades(next)}
        hasPairedCollection={preview.pairedCollection === true} />
    </div>
    <SuperMemoSourceSettings value={sourceFormat} onChange={next => void changeSourceFormat(next)} disabled={busy} />
  </div>);
}

function DraftSourcePicker({ name, disabled, onLoad, onLoadNew }: {
  name: string | undefined; disabled: boolean; onLoad(): void; onLoadNew?: (() => void) | undefined;
}) {
  const t = useTranslation();
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-foreground/15 px-4 py-3">
    <div className="min-w-0">
      <h2 className="text-sm font-semibold">{name ?? t('desktop.superMemoDrafts.sourceTitle')}</h2>
      {!name ? <p className="mt-1 max-w-prose text-sm text-foreground/70">{t('desktop.superMemoDrafts.prepareSource')}</p> : null}
    </div>
    <div className="flex flex-wrap gap-2">
      <AppButton disabled={disabled} onClick={onLoad}>{t(name ? 'desktop.superMemoDrafts.reloadSource' : 'desktop.superMemoDrafts.loadSource')}</AppButton>
      {onLoadNew ? <AppButton disabled={disabled} onClick={onLoadNew}>{t('desktop.superMemoDrafts.loadNewExport')}</AppButton> : null}
    </div>
  </div>;
}

function useSuperMemoDraftNavigation(
  { busy, error, setError, result }: Pick<ReturnType<typeof useSuperMemoDraft>, 'busy' | 'error' | 'setError' | 'result'>,
  close: () => void
) {
  const [parameters, setParameters] = useState(false);
  const [selection, setSelection] = useState<{ signature: string; ids: number[] }>();

  function backToPreview() {
    setParameters(false);
    setSelection(undefined);
  }

  function dismissDialog() {
    if (busy) return;
    close();
  }

  useDismissibleSurface({
    onDismiss: () => {
      if (error) setError(false);
      else if (!busy && parameters && !result) backToPreview();
      else dismissDialog();
    }
  });

  return { parameters, setParameters, selection, setSelection, backToPreview, dismissDialog };
}

function SuperMemoDraftDialog({ close, initialGrades }: { close: () => void; initialGrades: SuperMemoGradeMap }) {
  const t = useTranslation();
  const model = useSuperMemoDraft(initialGrades);
  const { draft, percent, setPercent, source, busy, error, setError, result, gradeMap, changeGrades, sourceFormat, changeSourceFormat, loadSource, importSource } = model;
  const { parameters, setParameters, selection, setSelection, backToPreview, dismissDialog } = useSuperMemoDraftNavigation(model, close);
  const preview = draft?.preview;
  const update = preview?.directoryUpdate;
  const selected = selection && selection.signature === update?.signature ? selection.ids : [];
  return (
    <AppDialog open onOpenChange={open => { if (!open) dismissDialog(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="task" className="max-h-[calc(100dvh-32px)] w-[min(1120px,calc(100vw-32px))]">
          <AppDialogTitle>{t('desktop.superMemoDrafts.title')}</AppDialogTitle>
          <AppDialogClose asChild>
            <AppButton className="absolute right-4 top-3" variant="ghost" disabled={busy}
              aria-label={t('desktop.superMemoDrafts.close')}>
              <X aria-hidden className="size-4" />
            </AppButton>
          </AppDialogClose>
          <AppDialogDescription className="sr-only">
            {t('desktop.superMemoDrafts.description')}
          </AppDialogDescription>
          <AppDialogBody className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            {(!parameters || update) && !result ? <DraftSourcePicker name={source?.name} disabled={busy}
              onLoad={() => { setSelection(undefined); void loadSource(); }}
              onLoadNew={update ? () => { setParameters(true); setSelection(undefined); void loadSource(true); } : undefined} /> : null}
            {busy ? <p role="status">{t('desktop.superMemoDrafts.loading')}</p> : null}
            {!result && !update ? <div hidden={parameters}><SuperMemoEntryPreview key={source?.filePath} preview={preview} elements={draft?.elements} /></div> : null}
            {parameters && preview && !result && !update ? (
              <SuperMemoParameters preview={preview} {...{ percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat, busy }} />
            ) : null}
            {!preview && !busy ? <SuperMemoBatchAdjustments /> : null}
            {update && !parameters && !result ? <p>{t('desktop.superMemoDrafts.existingBatch')}</p> : null}
            {update && parameters && !result ? <SuperMemoDirectoryUpdate update={update} sourceFormat={sourceFormat} disabled={busy}
              onSourceFormatChange={next => void changeSourceFormat(next)} /> : null}
            {update && parameters && !result ? <SuperMemoWithdrawals candidates={update.withdrawals} selected={selected}
              disabled={busy} onChange={ids => setSelection({ signature: update.signature, ids })} /> : null}
            {result ? <SuperMemoResult result={result} /> : null}
          </AppDialogBody>
          <SuperMemoDraftActions
            busy={busy} canConvert={Boolean(preview && !result)} parameters={parameters}
            directoryUpdate={update ? { canConfirm: (!update.pairedSourceRequired && update.sourceMatch?.linkOnConfirm === true) || selected.length > 0 || update.changes.some(change => change.status === 'move' || change.status === 'add') ||
              update.citationChanges.some(change => change.status === 'update') || update.textChanges.some(change => change.status === 'update') ||
              update.firstReviewChanges.some(change => change.status === 'update' || change.status === 'basis') } : undefined}
            backToPreview={backToPreview}
            openParameters={() => setParameters(true)} convert={() => void importSource(selected)}
          />
        </AppDialogContent>
      </AppDialogPortal>
      <SuperMemoLoadNotice error={error} busy={busy} onClose={() => setError(false)}
        recover={choose => void model.recoverCollection(choose)} retry={() => void model.retrySource()} />
    </AppDialog>
  );
}

export function SettingsSuperMemoImport() {
  const t = useTranslation();
  const [grades, setGrades] = useState<SuperMemoGradeMap>();
  return (
    <SettingsRow title={t('settings.general.dataMigration.superMemo')}>
      <SettingsControlSlot>
        <AppButton onClick={() => void loadSuperMemoGradeMap().then(setGrades)}>{t('desktop.superMemoDrafts.open')}</AppButton>
      </SettingsControlSlot>
      {grades ? <SuperMemoDraftDialog initialGrades={grades} close={() => setGrades(undefined)} /> : null}
    </SettingsRow>
  );
}
