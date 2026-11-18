import { useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { RememberedSuperMemoSource, SuperMemoMigrationForm, SuperMemoMigrationPanel } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import { previewRuntimeSuperMemoImport, runRuntimeSuperMemoImport, saveSuperMemoGradeMap } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { createSourceActions, previewFailure, rememberDraftSource } from './superMemoDraftSourceActions';
import type { DraftTarget, Pending, Source, SuperMemoNotice } from './superMemoDraftSourceActions';
import { initialSourceFormat, useSuperMemoSourceSelection } from './useSuperMemoSourceSelection';

async function refreshSourceFormat(apply: () => Promise<void>, setBusy: (value: boolean) => void,
  setError: (value: SuperMemoNotice) => void) {
  setBusy(true);
  setError(false);
  try {
    await apply();
  } catch (error) {
    setError(previewFailure(error));
  } finally {
    setBusy(false);
  }
}

function useDraftState(initialGrades: SuperMemoGradeMap) {
  const [target, setTarget] = useState<DraftTarget>();
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof previewRuntimeSuperMemoImport>>>();
  const [gradeMap, setGradeMap] = useState(initialGrades);
  const [sourceFormat, setSourceFormat] = useState(initialSourceFormat);
  const [percent, setPercent] = useState(0);
  const [retryAsUpdate, setRetryAsUpdate] = useState(false);
  const [source, setSource] = useState<Source>();
  const [remembered, setRemembered] = useState<RememberedSuperMemoSource>();
  const [result, setResult] = useState<Awaited<ReturnType<typeof runRuntimeSuperMemoImport>>>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<SuperMemoNotice>(false);
  const [pending, setPending] = useState<Pending>();

  return {
    target, setTarget, draft, setDraft, gradeMap, setGradeMap, sourceFormat, setSourceFormat, percent, setPercent,
    retryAsUpdate, setRetryAsUpdate, source, setSource, remembered, setRemembered, result, setResult,
    busy, setBusy, error, setError, pending, setPending
  };
}

export type DraftState = ReturnType<typeof useDraftState>;

function updateDraftFolder(state: DraftState, id: number, folder: boolean) {
  const { source, draft, gradeMap, sourceFormat, target, percent, setDraft, setBusy, setError } = state;
  if (state.busy || !source || !draft || draft.preview.directoryUpdate) return;
  const folderChoices = [...draft.folderChoices.filter(choice => choice.id !== id), { id, folder }];
  void refreshSourceFormat(async () => {
    const next = await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, gradeMap, sourceFormat, target, folderChoices);
    await rememberDraftSource(source, { percent, sourceFormat, folderChoices }, true);
    setDraft(next);
  }, setBusy, setError);
}

export function useSuperMemoDraft(initialGrades: SuperMemoGradeMap, pickerTitle: string, open = true) {
  const state = useDraftState(initialGrades);
  const { source, result, sourceFormat, target, gradeMap, percent, draft, setBusy, setError, setGradeMap, setDraft,
    setSourceFormat, remembered } = state;
  const selectionActions = useSuperMemoSourceSelection(state, open);
  const changeGrades = (next: SuperMemoGradeMap) => refreshSourceFormat(async () => {
    const nextPreview = source && !result
      ? await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, next, sourceFormat, target, draft?.folderChoices) : undefined;
    await saveSuperMemoGradeMap(next);
    if (remembered) await rememberDraftSource(remembered, { percent, sourceFormat, gradeMap: next }, true);
    setGradeMap(next);
    if (nextPreview) setDraft(nextPreview);
  }, setBusy, setError);

  function saveForm(next: Pick<SuperMemoMigrationForm, 'percent' | 'sourceFormat'>) {
    if (remembered) void rememberDraftSource(remembered, next, true).catch(() => setError('save'));
  }

  function changePercent(next: number) {
    state.setPercent(next);
    saveForm({ sourceFormat, percent: next });
  }

  function changeSourceFormat(next: SuperMemoSourceFormat) {
    if (!source || result || !draft?.preview.directoryUpdate) {
      setSourceFormat(next);
      saveForm({ percent, sourceFormat: next });
      return;
    }
    void refreshSourceFormat(async () => {
      const preview = await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, gradeMap, next, target);
      await rememberDraftSource(source, { percent, sourceFormat: next }, true);
      setDraft(preview);
      setSourceFormat(next);
    }, setBusy, setError);
  }

  const { busy, error } = state;

  return { draft, percent, setPercent: changePercent, source, selection: remembered, busy, error, setError,
    result, gradeMap, sourceFormat, changeGrades, changeFolder: (id: number, folder: boolean) => updateDraftFolder(state, id, folder),
    changeSourceFormat, importSource: (ids: number[]) => importDraft(state, ids, selectionActions.savePanel),
    candidates: state.pending?.candidates, ...selectionActions,
    ...createSourceActions(state, pickerTitle) };
}

async function importDraft(state: DraftState, withdrawSourceIds: number[], savePanel: (panel: SuperMemoMigrationPanel) => Promise<void>) {
  const { source, draft, percent, gradeMap, sourceFormat, target, setResult, setBusy, setError, setPending } = state;
  if (!source || !draft?.preview.previewSignature) return;
  setBusy(true);
  setError(false);
  try {
    const result = await runRuntimeSuperMemoImport(source.filePath, percent, gradeMap, draft.preview.previewSignature, sourceFormat,
      draft.preview.directoryUpdate?.signature, withdrawSourceIds, target, source.collectionDirectory ?? null, draft.folderChoices);
    setResult(result);
    const { batchId, imported, skipped, unresolvedImages } = result;
    await savePanel({ batchId, result: { imported, skipped, unresolvedImages }, step: 'load' });
  } catch (error) {
    const reason = previewFailure(error);
    if (reason.startsWith('collection')) {
      setPending({ selected: source, target });
      setError(reason);
    } else {
      setError(isImportAccessDenied(error) ? 'xmlAccess' : 'convert');
    }
  } finally {
    setBusy(false);
  }
}
