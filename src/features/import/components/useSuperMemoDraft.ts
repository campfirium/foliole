import { useState } from 'react';

import { applySuperMemoFolderDisplay } from '../../../../lib/core/import/superMemoImportStructure';
import { isValidSuperMemoReferenceMap, type SuperMemoReferenceMap } from '../../../../lib/core/import/superMemoReferenceFields';
import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { RememberedSuperMemoSource, SuperMemoMigrationForm, SuperMemoMigrationPanel, SuperMemoMigrationSnapshot } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import { parseRuntimeSuperMemoSource, previewRuntimeSuperMemoImport, readRuntimeRememberedSuperMemoSource, runRuntimeSuperMemoImport, saveSuperMemoGradeMap } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { automaticSourceFormat, createSourceActions, mappedSourceFormat, migrationSnapshot, previewFailure, rememberDraftSource } from './superMemoDraftSourceActions';
import type { DraftTarget, Pending, Source, SuperMemoNotice } from './superMemoDraftSourceActions';
import { useSuperMemoSourceSelection } from './useSuperMemoSourceSelection';

async function applyDraftChange(apply: () => Promise<void>, setBusy: (value: boolean) => void,
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
  const [sourceFormat, setSourceFormat] = useState(automaticSourceFormat);
  const [percent, setPercent] = useState(0);
  const [retryAsUpdate, setRetryAsUpdate] = useState(false);
  const [source, setSource] = useState<Source>();
  const [remembered, setRemembered] = useState<RememberedSuperMemoSource>();
  const [result, setResult] = useState<Awaited<ReturnType<typeof runRuntimeSuperMemoImport>>>();
  const [busy, setBusy] = useState(true);
  const [loadingXml, setLoadingXml] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<SuperMemoNotice>(false);
  const [pending, setPending] = useState<Pending>();

  return {
    target, setTarget, draft, setDraft, gradeMap, setGradeMap, sourceFormat, setSourceFormat, percent, setPercent,
    retryAsUpdate, setRetryAsUpdate, source, setSource, remembered, setRemembered, result, setResult,
    busy, setBusy, loadingXml, setLoadingXml, importing, setImporting, error, setError, pending, setPending
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
    remembered } = state;
  const selectionActions = useSuperMemoSourceSelection(state);
  const [invalidReferences, setInvalidReferences] = useState<{ source: typeof source; mapping: SuperMemoReferenceMap }>();
  const referenceMap = invalidReferences?.source === source && invalidReferences
    ? invalidReferences.mapping : sourceFormat.referenceMap ?? {};
  const changeGrades = (next: SuperMemoGradeMap) => applyDraftChange(async () => {
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

  function changeReferences(referenceMap: SuperMemoReferenceMap) {
    if (!isValidSuperMemoReferenceMap(referenceMap)) {
      setInvalidReferences({ source, mapping: referenceMap });
      return;
    }
    setInvalidReferences(undefined);
    const next = { ...mappedSourceFormat, referenceMap };
    state.setSourceFormat(next);
    saveForm({ sourceFormat: next, percent });
  }

  const { busy, error } = state;

  return { draft, percent, setPercent: changePercent, source, selection: remembered, busy, loadingXml: state.loadingXml, retryAsUpdate: state.retryAsUpdate, importing: state.importing, error, setError,
    result, gradeMap, sourceFormat, referenceMap, changeGrades, changeReferences, changeFolder: (id: number, folder: boolean) => updateDraftFolder(state, id, folder),
    importSource: (ids: number[]) => importDraft(state, ids, selectionActions.savePanel),
    reviewUpdate: () => reviewDraftUpdate(state),
    candidates: state.pending?.candidates, ...selectionActions,
    ...createSourceActions(state, pickerTitle) };
}

async function prepareImport(state: DraftState) {
  const { source, draft, gradeMap, sourceFormat, target } = state;
  const current = await readRuntimeRememberedSuperMemoSource();
  if (!current) throw new Error('supermemo_xml_missing');
  if (!source || current.filePath !== source.filePath || current.collectionDirectory !== source.collectionDirectory ||
      (source.savedForm?.comparison && !target)) throw new Error('supermemo_xml_updated');
  const { elements } = parseRuntimeSuperMemoSource(current.xml, current.collectionDirectory);
  const updatePercent = draft?.preview.directoryUpdate ? state.percent : undefined;
  const nextFormat = draft?.preview.directoryUpdate && !sourceFormat.referenceMap ? mappedSourceFormat : sourceFormat;
  const refreshed = await previewRuntimeSuperMemoImport(elements, current.collectionDirectory, gradeMap, nextFormat, target,
    draft?.folderChoices, updatePercent);
  return { current, elements, refreshed, updatePercent, sourceFormat: nextFormat };
}

async function runImportAction<T>(state: DraftState, action: () => Promise<T>) {
  const { busy, setBusy, setImporting, setError, setPending, source, target } = state;
  if (busy || !source) return;
  setBusy(true);
  setImporting(true);
  setError(false);
  try {
    return await action();
  } catch (error) {
    const reason = previewFailure(error);
    if (reason.startsWith('collection')) {
      setPending({ selected: source, target });
      setError(reason);
    } else {
      const message = String(error);
      if (reason === 'xmlUpdated' || message.includes('supermemo_preview_changed') ||
        message.includes('supermemo_update_changed')) setError('xmlUpdated');
      else if (message.includes('ENOENT') || message.includes('supermemo_xml_missing')) setError('xmlRead');
      else setError(isImportAccessDenied(error) ? 'xmlAccess' : 'convert');
    }
  } finally {
    setImporting(false);
    setBusy(false);
  }
}

function reviewDraftUpdate(state: DraftState) {
  return runImportAction(state, async () => {
    const { refreshed } = await prepareImport(state);
    if (!refreshed.preview.directoryUpdate) throw new Error('supermemo_update_changed');
    state.setDraft(refreshed);
    return refreshed.preview.directoryUpdate;
  });
}

function importDraft(state: DraftState, withdrawSourceIds: number[], savePanel: (panel: SuperMemoMigrationPanel, snapshot?: SuperMemoMigrationSnapshot) => Promise<void>) {
  const { draft, percent, gradeMap, sourceFormat, target, setResult } = state;
  if (!draft?.preview.previewSignature || (sourceFormat.referenceMap && !isValidSuperMemoReferenceMap(sourceFormat.referenceMap))) return;
  return runImportAction(state, async () => {
    const { current, elements, refreshed, updatePercent, sourceFormat: appliedFormat } = await prepareImport(state);
    const updateSignature = draft.preview.directoryUpdate?.signature;
    const result = await runRuntimeSuperMemoImport({ elements, percent, gradeMap, sourceFormat: appliedFormat,
      previewSignature: refreshed.preview.previewSignature!, folderChoices: draft.folderChoices,
      ...(current.collectionDirectory ? { collectionDirectory: current.collectionDirectory } : {}),
      ...(updatePercent !== undefined ? { updatePercent } : {}),
      ...(updateSignature ? { updateSignature } : {}), ...(withdrawSourceIds.length ? { withdrawSourceIds } : {}), ...target });
    setResult(result);
    const { batchId, imported, skipped, unresolvedImages } = result;
    const completed = await previewRuntimeSuperMemoImport(elements, current.collectionDirectory, gradeMap, appliedFormat, undefined, draft.folderChoices)
      .catch(() => undefined);
    await savePanel({ batchId, result: { imported, skipped, unresolvedImages }, step: 'grades' },
      completed ? migrationSnapshot(completed) : undefined);
    if (completed) {
      state.setDraft(completed);
      state.setTarget(undefined);
      state.setSource({ ...current, xml: '' });
    }
  });
}
