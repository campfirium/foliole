import { useEffect, useEffectEvent, useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { SuperMemoMigrationForm } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import { loadRuntimeSuperMemoSourceLink, previewRuntimeSuperMemoImport, readRuntimeSuperMemoComparison,
  runRuntimeSuperMemoImport, saveSuperMemoGradeMap } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { createSourceActions, loadDraftWithSavedFormat, previewFailure, rememberDraftSource } from './superMemoDraftSourceActions';
import type { DraftTarget, Pending, Source, SuperMemoNotice } from './superMemoDraftSourceActions';

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
  const [sourceFormat, setSourceFormat] = useState<SuperMemoSourceFormat>({ ...DEFAULT_SUPER_MEMO_SOURCE_FORMAT, placement: 'topic-info' });
  const [percent, setPercent] = useState(0);
  const [retryAsUpdate, setRetryAsUpdate] = useState(false);
  const [source, setSource] = useState<Source>();
  const [result, setResult] = useState<Awaited<ReturnType<typeof runRuntimeSuperMemoImport>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SuperMemoNotice>(false);
  const [pending, setPending] = useState<Pending>();

  return {
    target, setTarget, draft, setDraft, gradeMap, setGradeMap, sourceFormat, setSourceFormat, percent, setPercent,
    retryAsUpdate, setRetryAsUpdate, source, setSource, result, setResult, busy, setBusy, error, setError, pending, setPending
  };
}

export type DraftState = ReturnType<typeof useDraftState>;

function updateDraftFolder(state: DraftState, id: number, folder: boolean) {
  const { source, draft, gradeMap, sourceFormat, target, percent, setDraft, setBusy, setError } = state;
  if (state.busy || !source || !draft || draft.preview.directoryUpdate) return;
  const folderChoices = [...draft.folderChoices.filter(choice => choice.id !== id), { id, folder }];
  void refreshSourceFormat(async () => {
    const next = await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, gradeMap, sourceFormat, target, folderChoices);
    await rememberDraftSource(source, percent, sourceFormat, target, true, folderChoices);
    setDraft(next);
  }, setBusy, setError);
}

export function useSuperMemoDraft(initialGrades: SuperMemoGradeMap, pickerTitle: string) {
  const state = useDraftState(initialGrades);
  const { source, result, sourceFormat, target, gradeMap, percent, draft, setBusy, setError, setGradeMap, setDraft,
    setSourceFormat, setResult, setPending } = state;
  const changeGrades = (next: SuperMemoGradeMap) => refreshSourceFormat(async () => {
    const nextPreview = source && !result
      ? await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, next, sourceFormat, target, draft?.folderChoices) : undefined;
    await saveSuperMemoGradeMap(next);
    setGradeMap(next);
    if (nextPreview) setDraft(nextPreview);
  }, setBusy, setError);

  function saveForm(next: Pick<SuperMemoMigrationForm, 'percent' | 'sourceFormat'>) {
    if (source) void rememberDraftSource(source, next.percent, next.sourceFormat, target, true).catch(() => setError('save'));
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
      await rememberDraftSource(source, percent, next, target, true);
      setDraft(preview);
      setSourceFormat(next);
    }, setBusy, setError);
  }

  async function importSource(withdrawSourceIds: number[]) {
    if (!source || !draft?.preview.previewSignature) return;
    setBusy(true);
    setError(false);
    try {
      setResult(await runRuntimeSuperMemoImport(source.filePath, percent, gradeMap, draft.preview.previewSignature, sourceFormat,
        draft.preview.directoryUpdate?.signature, withdrawSourceIds, target, source.collectionDirectory ?? null, draft.folderChoices));
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

  const resetCompletedDraft = useRestoreDraft(state);
  const { busy, error } = state;

  return { draft, percent, setPercent: changePercent, source, busy, error, setError, result, gradeMap, sourceFormat,
    changeGrades, changeFolder: (id: number, folder: boolean) => updateDraftFolder(state, id, folder), changeSourceFormat, importSource, resetCompletedDraft, candidates: state.pending?.candidates,
    ...createSourceActions(state, pickerTitle) };
}

function useRestoreDraft(state: DraftState) {
  const { gradeMap, setBusy, setError, setPending, setSourceFormat, setDraft } = state;
  async function restoreSource(isCurrent = () => true) {
    setBusy(true);
    setError(false);
    setPending(undefined);
    let linked: Source | null = null;
    try {
      linked = await loadRuntimeSuperMemoSourceLink();
      if (!linked?.savedForm || !isCurrent()) return;
      const saved = linked.savedForm;
      if (linked.collectionDiscoveryFailure) throw new Error('supermemo_collection_unreadable');
      const restored = await restorePreview(linked, saved, gradeMap);
      if (!isCurrent()) return;
      state.setSource(linked);
      state.setTarget(restored.target);
      state.setPercent(saved.percent);
      setSourceFormat(saved.sourceFormat);
      setDraft(restored.draft);
    } catch (error) {
      if (!isCurrent()) return;
      let reason = previewFailure(error);
      if (linked?.savedForm && reason.startsWith('collection')) {
        try {
          const target = await restoreTarget(linked.savedForm);
          if (isCurrent()) setPending({ selected: linked, target });
        } catch {
          reason = 'xmlRead';
        }
      }
      if (isCurrent()) setError(isImportAccessDenied(error) ? 'xmlAccess' : reason === 'preview' ? 'xmlRead' : reason);
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  const restoreInitialSource = useEffectEvent(restoreSource);
  useEffect(() => {
    let active = true;
    void restoreInitialSource(() => active);
    return () => { active = false; };
  }, []);

  return function resetCompletedDraft() {
    state.setResult(undefined);
    setDraft(undefined);
    state.setSource(undefined);
    state.setTarget(undefined);
    return restoreSource();
  };
}

async function restoreTarget(form: SuperMemoMigrationForm): Promise<DraftTarget | undefined> {
  if (!form.comparison) return undefined;
  const { batchId, originalFilePath } = form.comparison;
  return { targetBatchId: batchId, originalFilePath,
    ...(originalFilePath ? { originalElements: await readRuntimeSuperMemoComparison() } : {}) };
}

async function restorePreview(source: Source, form: SuperMemoMigrationForm, gradeMap: SuperMemoGradeMap) {
  const { draft } = await loadDraftWithSavedFormat(source, gradeMap, form.sourceFormat, false);
  if (!form.comparison || draft.preview.directoryUpdate?.batchId === form.comparison.batchId) {
    return { draft, target: undefined };
  }
  const target = await restoreTarget(form);
  return { draft: await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, gradeMap, form.sourceFormat, target), target };
}
