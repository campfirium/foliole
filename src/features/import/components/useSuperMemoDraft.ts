import { useState } from 'react';

import { applySuperMemoFolderDisplay } from '../../../../lib/core/import/superMemoImportStructure';
import { isValidSuperMemoReferenceMap, type SuperMemoReferenceMap } from '../../../../lib/core/import/superMemoReferenceFields';
import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { RememberedSuperMemoSource, SuperMemoMigrationForm, SuperMemoMigrationPanel, SuperMemoMigrationSnapshot } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import { parseRuntimeSuperMemoSource, previewRuntimeSuperMemoImport, readRuntimeRememberedSuperMemoSource, runRuntimeSuperMemoImport, saveSuperMemoGradeMap } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { automaticSourceFormat, createSourceActions } from './superMemoDraftSourceActions';
import type { DraftTarget, Pending, Source } from './superMemoDraftSourceActions';
import { previewFailure, superMemoNoticeKind, type SuperMemoNotice } from './superMemoNotice';
import { mappedSourceFormat, migrationSnapshot, rememberDraftSource } from './superMemoSavedDraft';
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
  const selectionActions = useSuperMemoSourceSelection(state, initialGrades);
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
    reviewUpdate: () => reviewDraftUpdate(state, selectionActions.savePanel),
    candidates: state.pending?.candidates, ...selectionActions,
    ...createSourceActions(state, pickerTitle, initialGrades) };
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
    const fallback = isImportAccessDenied(error) ? 'xmlAccess' : String(error).includes('ENOENT') ? 'xmlRead' : 'convert';
    const reason = previewFailure(error, fallback);
    if (superMemoNoticeKind(reason)?.startsWith('collection')) setPending({ selected: source, target });
    setError(reason);
  } finally {
    setImporting(false);
    setBusy(false);
  }
}

type SavePanel = (panel: SuperMemoMigrationPanel, snapshot?: SuperMemoMigrationSnapshot) => Promise<void>;

function reviewDraftUpdate(state: DraftState, savePanel: SavePanel) {
  return runImportAction(state, async () => {
    const prepared = await prepareImport(state);
    const { refreshed } = prepared;
    const update = refreshed.preview.directoryUpdate;
    if (!update) throw new Error('supermemo_update_changed');
    const internalOnly = update.hasRuleCorrections && !update.sourceMatch && !update.pairedSourceRequired &&
      update.proposedPercent === undefined && !update.changes.length && !update.citationChanges.length &&
      !update.textChanges.length && !update.firstReviewChanges.length && !update.withdrawals.length;
    if (internalOnly) {
      await writePreparedImport(state, prepared, [], savePanel, update.signature);
      return undefined;
    }
    if (update.hasRuleCorrections) {
      await persistPreparedImport(state, prepared, [], update.signature, true);
      const afterCorrections = await prepareImport(state);
      state.setDraft(afterCorrections.refreshed);
      return afterCorrections.refreshed.preview.directoryUpdate;
    }
    state.setDraft(refreshed);
    return update;
  });
}

function importDraft(state: DraftState, withdrawSourceIds: number[], savePanel: SavePanel) {
  const { draft, sourceFormat } = state;
  if (!draft?.preview.previewSignature || (sourceFormat.referenceMap && !isValidSuperMemoReferenceMap(sourceFormat.referenceMap))) return;
  return runImportAction(state, async () => writePreparedImport(state, await prepareImport(state), withdrawSourceIds,
    savePanel, draft.preview.directoryUpdate?.signature));
}

function persistPreparedImport(state: DraftState, prepared: Awaited<ReturnType<typeof prepareImport>>,
  withdrawSourceIds: number[], updateSignature?: string, ruleCorrectionsOnly?: true) {
  const { percent, gradeMap, target } = state;
  const { current, elements, refreshed, updatePercent, sourceFormat } = prepared;
  return runRuntimeSuperMemoImport({ elements, percent, gradeMap, sourceFormat,
    previewSignature: refreshed.preview.previewSignature!, folderChoices: refreshed.folderChoices,
    ...(current.collectionDirectory ? { collectionDirectory: current.collectionDirectory } : {}),
    ...(updatePercent !== undefined ? { updatePercent } : {}),
    ...(updateSignature ? { updateSignature } : {}), ...(withdrawSourceIds.length ? { withdrawSourceIds } : {}),
    ...(ruleCorrectionsOnly ? { ruleCorrectionsOnly } : {}), ...target });
}

async function writePreparedImport(state: DraftState, prepared: Awaited<ReturnType<typeof prepareImport>>,
  withdrawSourceIds: number[], savePanel: SavePanel, updateSignature?: string) {
  const { gradeMap, setResult } = state;
  const { current, elements, refreshed, sourceFormat } = prepared;
  const result = await persistPreparedImport(state, prepared, withdrawSourceIds, updateSignature);
  setResult(result);
  const { batchId, imported, skipped, unresolvedImages } = result;
  const completed = await previewRuntimeSuperMemoImport(elements, current.collectionDirectory, gradeMap, sourceFormat, undefined, refreshed.folderChoices)
    .catch(() => undefined);
  await savePanel({ batchId, result: { imported, skipped, unresolvedImages }, step: result.directoryUpdate ? 'grades' : 'complete' },
    completed ? migrationSnapshot(completed) : undefined);
  if (completed) {
    state.setDraft(completed);
    state.setTarget(undefined);
    state.setSource({ ...current, xml: '' });
  }
}
