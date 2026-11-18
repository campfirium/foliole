import { useState } from 'react';

import { applySuperMemoFolderDisplay } from '../../../../lib/core/import/superMemoImportStructure';
import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { RememberedSuperMemoSource, SuperMemoMigrationForm, SuperMemoMigrationPanel, SuperMemoMigrationSnapshot } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import { parseRuntimeSuperMemoSource, previewRuntimeSuperMemoImport, readRuntimeRememberedSuperMemoSource, runRuntimeSuperMemoImport, saveSuperMemoGradeMap } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { createSourceActions, migrationSnapshot, previewFailure, rememberDraftSource } from './superMemoDraftSourceActions';
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
  const { source, draft, sourceFormat, percent, setDraft, setError } = state;
  if (state.busy || !source || !draft || draft.preview.directoryUpdate) return;
  const index = draft.preview.rows.findIndex(row => row.id === id);
  const row = draft.preview.rows[index];
  if (!row?.structure?.editable) return;
  const folderChoices = [...draft.folderChoices.filter(choice => choice.id !== id), { id, folder }];
  const rows = draft.preview.rows.slice();
  rows[index] = applySuperMemoFolderDisplay(row, folder);
  setDraft({ ...draft, folderChoices, preview: { ...draft.preview, rows } });
  void rememberDraftSource(source, { percent, sourceFormat, folderChoices }, true).catch(() => setError('save'));
}

export function useSuperMemoDraft(initialGrades: SuperMemoGradeMap, pickerTitle: string) {
  const state = useDraftState(initialGrades);
  const { source, result, sourceFormat, target, gradeMap, percent, draft, setBusy, setError, setGradeMap, setDraft,
    setSourceFormat, remembered } = state;
  const selectionActions = useSuperMemoSourceSelection(state);
  const changeGrades = (next: SuperMemoGradeMap) => refreshSourceFormat(async () => {
    const nextPreview = source && !result && (source.draft || source.xml)
      ? await previewRuntimeSuperMemoImport(source.draft?.elements ?? source.xml, source.collectionDirectory, next, sourceFormat, target, draft?.folderChoices) : undefined;
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
    if (!source || result || !draft?.preview.directoryUpdate || (!source.draft && !source.xml)) {
      setSourceFormat(next);
      saveForm({ percent, sourceFormat: next });
      return;
    }
    void refreshSourceFormat(async () => {
      const preview = await previewRuntimeSuperMemoImport(source.draft?.elements ?? source.xml, source.collectionDirectory, gradeMap, next, target);
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

async function importDraft(state: DraftState, withdrawSourceIds: number[], savePanel: (panel: SuperMemoMigrationPanel, snapshot?: SuperMemoMigrationSnapshot) => Promise<void>) {
  const { source, draft, percent, gradeMap, sourceFormat, target, setResult, setBusy, setError, setPending } = state;
  if (!source || !draft?.preview.previewSignature) return;
  setBusy(true);
  setError(false);
  try {
    const current = await readRuntimeRememberedSuperMemoSource();
    if (!current) throw new Error('supermemo_xml_missing');
    if (current.filePath !== source.filePath || current.collectionDirectory !== source.collectionDirectory ||
      (source.savedForm?.comparison && !target)) throw new Error('supermemo_xml_updated');
    const { elements } = parseRuntimeSuperMemoSource(current.xml, current.collectionDirectory);
    const refreshed = await previewRuntimeSuperMemoImport(elements, current.collectionDirectory, gradeMap, sourceFormat, target, draft.folderChoices);
    const updateSignature = draft.preview.directoryUpdate?.signature;
    const result = await runRuntimeSuperMemoImport({ elements, percent, gradeMap, sourceFormat,
      previewSignature: refreshed.preview.previewSignature!, folderChoices: draft.folderChoices,
      ...(current.collectionDirectory ? { collectionDirectory: current.collectionDirectory } : {}),
      ...(updateSignature ? { updateSignature } : {}), ...(withdrawSourceIds.length ? { withdrawSourceIds } : {}), ...target });
    setResult(result);
    const { batchId, imported, skipped, unresolvedImages } = result;
    const completed = await previewRuntimeSuperMemoImport(elements, current.collectionDirectory, gradeMap, sourceFormat, undefined, draft.folderChoices)
      .catch(() => undefined);
    await savePanel({ batchId, result: { imported, skipped, unresolvedImages }, step: 'load' },
      completed ? migrationSnapshot(completed) : undefined);
    if (completed) {
      state.setDraft(completed);
      state.setTarget(undefined);
    }
  } catch (error) {
    const reason = previewFailure(error);
    if (reason.startsWith('collection')) {
      setPending({ selected: source, target });
      setError(reason);
    } else {
      const message = String(error);
      if (reason === 'xmlUpdated' || message.includes('supermemo_preview_changed')) setError('xmlUpdated');
      else if (message.includes('ENOENT') || message.includes('supermemo_xml_missing')) setError('xmlRead');
      else setError(isImportAccessDenied(error) ? 'xmlAccess' : 'convert');
    }
  } finally {
    setBusy(false);
  }
}
