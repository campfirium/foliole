import { X } from 'lucide-react';
import { useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { loadSuperMemoGradeMap, previewRuntimeSuperMemoImport, runRuntimeSuperMemoImport,
  saveSuperMemoGradeMap, selectRuntimeSuperMemoSource } from '../../../shared/platform/import/superMemoImportRuntimeRepository';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogClose, AppDialogContent, AppDialogDescription,
  AppDialogOverlay, AppDialogPortal, AppDialogTitle, SettingsControlSlot, SettingsRow
} from '../../../shared/ui';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoConversionRules } from './SuperMemoConversionRules';
import { SuperMemoDirectoryUpdate } from './SuperMemoDirectoryUpdate';
import { SuperMemoDraftActions } from './SuperMemoDraftActions';
import { SuperMemoDraftTable } from './SuperMemoDraftTable';
import { SuperMemoEntryPreview } from './SuperMemoEntryPreview';
import { SuperMemoGradeSettings } from './SuperMemoGradeSettings';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';
import { SuperMemoSourceSettings } from './SuperMemoSourceSettings';

async function refreshSourceFormat(apply: () => Promise<void>, setBusy: (value: boolean) => void,
  setError: (value: boolean) => void) {
  setBusy(true);
  setError(false);
  try {
    await apply();
  } catch {
    setError(true);
  } finally {
    setBusy(false);
  }
}

function useSuperMemoDraft(initialGrades: SuperMemoGradeMap) {
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof previewRuntimeSuperMemoImport>>>();
  const [gradeMap, setGradeMap] = useState(initialGrades);
  const [sourceFormat, setSourceFormat] = useState<SuperMemoSourceFormat>({ ...DEFAULT_SUPER_MEMO_SOURCE_FORMAT, placement: 'topic-info' });
  const [percent, setPercent] = useState(0);
  const [source, setSource] = useState<NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoSource>>>>();
  const [result, setResult] = useState<Awaited<ReturnType<typeof runRuntimeSuperMemoImport>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<boolean | 'xml-only'>(false);

  async function loadSource() {
    setBusy(true);
    setError(false);
    try {
      const selected = await selectRuntimeSuperMemoSource();
      if (!selected) return;
      setDraft(await previewRuntimeSuperMemoImport(selected.xml, selected.collectionDirectory, gradeMap, sourceFormat));
      setSource(selected);
      if (!selected.collectionDirectory) setError('xml-only');
      setPercent(0);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function changeGrades(next: SuperMemoGradeMap) {
    setBusy(true);
    setError(false);
    try {
      const nextPreview = source && !result ? await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, next, sourceFormat) : undefined;
      await saveSuperMemoGradeMap(next);
      setGradeMap(next);
      if (nextPreview) setDraft(nextPreview);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const changeSourceFormat = (next: SuperMemoSourceFormat) => refreshSourceFormat(async () => {
    if (source && !result) setDraft(await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, gradeMap, next));
    setSourceFormat(next);
  }, setBusy, setError);

  async function importSource() {
    if (!source || !draft?.preview.previewSignature) return;
    setBusy(true);
    setError(false);
    try {
      setResult(await runRuntimeSuperMemoImport(source.filePath, percent, gradeMap, draft.preview.previewSignature, sourceFormat,
        draft.preview.directoryUpdate?.signature));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return { draft, percent, setPercent, source, busy, error, setError, result, gradeMap, changeGrades, sourceFormat, changeSourceFormat, loadSource, importSource };
}

function SuperMemoParameters({ preview, percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat, busy }: {
  preview: NonNullable<Awaited<ReturnType<typeof previewRuntimeSuperMemoImport>>['preview']>;
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
      <SuperMemoGradeSettings disabled={busy} value={gradeMap} onChange={next => void changeGrades(next)} />
    </div>
    <SuperMemoSourceSettings value={sourceFormat} onChange={next => void changeSourceFormat(next)} disabled={busy} />
  </div>);
}

function SuperMemoLoadNotice({ error, onClose }: { error: boolean | 'xml-only'; onClose(): void }) {
  const t = useTranslation();
  return (
    <AppDialog open={Boolean(error)} onOpenChange={open => { if (!open) onClose(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="notice">
          <AppDialogTitle>{t(error === 'xml-only' ? 'desktop.superMemoDrafts.noCollection' : 'desktop.superMemoDrafts.loadFailed')}</AppDialogTitle>
          <AppDialogBody>
            <AppDialogDescription>{t(error === 'xml-only' ? 'desktop.superMemoDrafts.collectionHelp' : 'desktop.superMemoDrafts.importFailed')}</AppDialogDescription>
          </AppDialogBody>
          <AppDialogActions>
            <AppDialogClose asChild><AppButton>{t(error === 'xml-only'
              ? 'desktop.superMemoDrafts.continueXml' : 'desktop.superMemoDrafts.close')}</AppButton></AppDialogClose>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function SuperMemoResult({ result }: { result: Awaited<ReturnType<typeof runRuntimeSuperMemoImport>> }) {
  const t = useTranslation();
  const added = result.directoryUpdate?.changes.filter(change => change.status === 'add').length ?? 0;
  return <p role="status">{result.directoryUpdate ? t('desktop.superMemoDrafts.directoryUpdated', {
    count: result.directoryUpdate.changes.filter(change => change.status === 'move').length
  }) + (added ? ' · ' + t('desktop.superMemoDrafts.directoryAdded', { count: added }) : '') : t('desktop.superMemoDrafts.importResult', {
    imported: result.imported, skipped: result.skipped, unresolvedImages: result.unresolvedImages
  })}</p>;
}

function SuperMemoDraftDialog({ close, initialGrades }: { close: () => void; initialGrades: SuperMemoGradeMap }) {
  const t = useTranslation();
  const { draft, percent, setPercent, source, busy, error, setError, result, gradeMap, changeGrades, sourceFormat, changeSourceFormat, loadSource, importSource } = useSuperMemoDraft(initialGrades);
  const [parameters, setParameters] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const preview = draft?.preview;
  const update = preview?.directoryUpdate;
  return (
    <AppDialog open onOpenChange={open => { if (!open && !busy) close(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent layout="task" className="max-h-[calc(100dvh-32px)] w-[min(1120px,calc(100vw-32px))]">
          <AppDialogTitle>{t(showRules ? 'desktop.superMemoRules.title' : 'desktop.superMemoDrafts.title')}</AppDialogTitle>
          <AppDialogClose asChild>
            <AppButton className="absolute right-4 top-3" variant="ghost" disabled={busy}
              aria-label={t('desktop.superMemoDrafts.close')}>
              <X aria-hidden className="size-4" />
            </AppButton>
          </AppDialogClose>
          <AppDialogDescription className="sr-only">
            {t(showRules ? 'desktop.superMemoRules.description' : 'desktop.superMemoDrafts.description')}
          </AppDialogDescription>
          {showRules ? <SuperMemoConversionRules /> : null}
          <AppDialogBody className={showRules ? 'hidden' : 'flex min-h-0 flex-col gap-3 overflow-y-auto'}>
            {(!parameters || update) && !result ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-foreground/15 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{source?.name ?? t('desktop.superMemoDrafts.sourceTitle')}</h2>
                <p className="mt-1 max-w-prose text-sm text-foreground/70">
                  {!source ? t('desktop.superMemoDrafts.prepareSource') : null}
                </p>
              </div>
              <AppButton disabled={busy} onClick={() => void loadSource()}>
                {t(source ? 'desktop.superMemoDrafts.reloadSource' : 'desktop.superMemoDrafts.loadSource')}
              </AppButton>
            </div> : null}
            {busy ? <p role="status">{t('desktop.superMemoDrafts.loading')}</p> : null}
            {!result && !update ? <div hidden={parameters}><SuperMemoEntryPreview key={source?.filePath} preview={preview} elements={draft?.elements} /></div> : null}
            {parameters && preview && !result && !update ? (
              <SuperMemoParameters preview={preview} {...{ percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat, busy }} />
            ) : null}
            {!preview && !busy ? <SuperMemoBatchAdjustments /> : null}
            {update && !parameters && !result ? <p>{t('desktop.superMemoDrafts.existingBatch')}</p> : null}
            {update && parameters && !result ? <SuperMemoDirectoryUpdate update={update} /> : null}
            {result ? <SuperMemoResult result={result} /> : null}
          </AppDialogBody>
          <SuperMemoDraftActions
            busy={busy} showRules={showRules} canConvert={Boolean(preview && !result)} parameters={parameters}
            directoryUpdate={update ? { canConfirm: update.changes.some(change => change.status === 'move' || change.status === 'add') } : undefined}
            toggleRules={() => setShowRules(!showRules)} backToPreview={() => setParameters(false)}
            openParameters={() => setParameters(true)} convert={() => void importSource()}
          />
        </AppDialogContent>
      </AppDialogPortal>
      <SuperMemoLoadNotice error={error} onClose={() => setError(false)} />
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
