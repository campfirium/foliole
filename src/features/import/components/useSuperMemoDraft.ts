import { useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import { previewRuntimeSuperMemoImport, runRuntimeSuperMemoImport, saveSuperMemoGradeMap,
  selectRuntimeSuperMemoCollection, selectRuntimeSuperMemoSource, type SuperMemoUpdateTarget } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

type Source = NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoSource>>>;

export type SuperMemoNotice = false | 'xml-only' | 'xmlAccess' | 'xmlSize' | 'xmlRead' | 'xmlFormat' |
  'collectionAccess' | 'collectionRead' | 'collectionMismatch' | 'preview' | 'convert';

function previewFailure(error: unknown) {
  const message = String(error);
  if (message.includes('invalid_supermemo_xml')) return 'xmlFormat';
  if (message.includes('supermemo_collection_access_denied')) return 'collectionAccess';
  if (message.includes('supermemo_collection_mismatch')) return 'collectionMismatch';
  if (message.includes('supermemo_collection_unreadable')) return 'collectionRead';
  return 'preview';
}

async function refreshSourceFormat(apply: () => Promise<void>, setBusy: (value: boolean) => void,
  setError: (value: SuperMemoNotice) => void) {
  setBusy(true);
  setError(false);
  try {
    await apply();
  } catch {
    setError('preview');
  } finally {
    setBusy(false);
  }
}

async function loadDraftWithSavedFormat(selected: NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoSource>>>,
  gradeMap: SuperMemoGradeMap, sourceFormat: SuperMemoSourceFormat) {
  const first = await previewRuntimeSuperMemoImport(selected.xml, selected.collectionDirectory, gradeMap, sourceFormat);
  const savedFormat = first.preview.directoryUpdate?.sourceFormat;
  const loaded = savedFormat && (savedFormat.placement !== sourceFormat.placement || savedFormat.template !== sourceFormat.template)
    ? await previewRuntimeSuperMemoImport(selected.xml, selected.collectionDirectory, gradeMap, savedFormat) : first;
  return { draft: loaded, sourceFormat: savedFormat ?? sourceFormat };
}

function useDraftState(initialGrades: SuperMemoGradeMap) {
  const [target, setTarget] = useState<SuperMemoUpdateTarget>();
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof previewRuntimeSuperMemoImport>>>();
  const [gradeMap, setGradeMap] = useState(initialGrades);
  const [sourceFormat, setSourceFormat] = useState<SuperMemoSourceFormat>({ ...DEFAULT_SUPER_MEMO_SOURCE_FORMAT, placement: 'topic-info' });
  const [percent, setPercent] = useState(0);
  const [retryAsUpdate, setRetryAsUpdate] = useState(false);
  const [source, setSource] = useState<Source>();
  const [result, setResult] = useState<Awaited<ReturnType<typeof runRuntimeSuperMemoImport>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SuperMemoNotice>(false);
  const [pending, setPending] = useState<{ selected: Source; target: SuperMemoUpdateTarget | undefined }>();

  return {
    target, setTarget, draft, setDraft, gradeMap, setGradeMap, sourceFormat, setSourceFormat, percent, setPercent,
    retryAsUpdate, setRetryAsUpdate, source, setSource, result, setResult, busy, setBusy, error, setError, pending, setPending
  };
}

type DraftState = ReturnType<typeof useDraftState>;

function createCandidateLoader(state: DraftState) {
  const { gradeMap, sourceFormat, setTarget, setSourceFormat, setDraft, setSource, setPercent, setPending, setError } = state;
  return async function loadCandidate(selected: Source, nextTarget: SuperMemoUpdateTarget | undefined, showMissing: boolean) {
    try {
      const loaded = nextTarget
        ? { draft: await previewRuntimeSuperMemoImport(selected.xml, selected.collectionDirectory, gradeMap, sourceFormat, nextTarget), sourceFormat }
        : await loadDraftWithSavedFormat(selected, gradeMap, sourceFormat);
      if (selected.collectionDiscoveryFailure) {
        setPending({ selected, target: nextTarget });
        setError(selected.collectionDiscoveryFailure === 'access' ? 'collectionAccess' : 'collectionRead');
        return;
      }
      setTarget(nextTarget);
      setSourceFormat(loaded.sourceFormat);
      setDraft(loaded.draft);
      setSource(selected);
      setPercent(0);
      const notice = showMissing && !selected.collectionDirectory ? 'xml-only' : false;
      setPending(notice ? { selected, target: nextTarget } : undefined);
      setError(notice);
    } catch (error) {
      const reason = previewFailure(error);
      setPending(reason.startsWith('collection') ? { selected, target: nextTarget } : undefined);
      setError(reason);
    }
  };
}

function createSourceActions(state: DraftState) {
  const { draft, target, pending, source, busy, setBusy, setError, setPending, retryAsUpdate, setRetryAsUpdate } = state;
  const loadCandidate = createCandidateLoader(state);

  async function loadSource(asUpdate = false) {
    setBusy(true);
    setError(false);
    setPending(undefined);
    setRetryAsUpdate(asUpdate);
    try {
      const selected = await selectRuntimeSuperMemoSource();
      if (!selected) return;
      const update = draft?.preview.directoryUpdate;
      const nextTarget = asUpdate && update && draft
        ? target ?? { targetBatchId: update.batchId, ...(!update.sourceMatch ? { originalElements: draft.elements } : {}) } : undefined;
      await loadCandidate(selected, nextTarget, true);
    } catch (error) {
      setError(isImportAccessDenied(error) ? 'xmlAccess' : /invalid_supermemo_xml_size/.test(String(error)) ? 'xmlSize' : 'xmlRead');
    } finally {
      setBusy(false);
    }
  }

  async function recoverCollection(chooseFolder: boolean) {
    if (!pending || busy) return;
    if (!chooseFolder && pending.selected === source && !source.collectionDirectory) {
      setError(false);
      setPending(undefined);
      return;
    }
    setBusy(true);
    try {
      const directory = chooseFolder ? await selectRuntimeSuperMemoCollection() : undefined;
      if (chooseFolder && !directory) return;
      const { filePath, name, xml } = pending.selected;
      await loadCandidate({ filePath, name, xml, collectionDirectory: directory ?? undefined }, pending.target, false);
    } catch (error) {
      setError(isImportAccessDenied(error) ? 'collectionAccess' : 'collectionRead');
    } finally {
      setBusy(false);
    }
  }

  return { loadSource, recoverCollection, retrySource: () => loadSource(retryAsUpdate) };
}

export function useSuperMemoDraft(initialGrades: SuperMemoGradeMap) {
  const state = useDraftState(initialGrades);
  const { source, result, sourceFormat, target, gradeMap, percent, draft, setBusy, setError, setGradeMap, setDraft,
    setSourceFormat, setResult, setPending } = state;
  const changeGrades = (next: SuperMemoGradeMap) => refreshSourceFormat(async () => {
    const nextPreview = source && !result
      ? await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, next, sourceFormat, target) : undefined;
    await saveSuperMemoGradeMap(next);
    setGradeMap(next);
    if (nextPreview) setDraft(nextPreview);
  }, setBusy, setError);

  const changeSourceFormat = (next: SuperMemoSourceFormat) => refreshSourceFormat(async () => {
    if (source && !result) setDraft(await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, gradeMap, next, target));
    setSourceFormat(next);
  }, setBusy, setError);

  async function importSource(withdrawSourceIds: number[]) {
    if (!source || !draft?.preview.previewSignature) return;
    setBusy(true);
    setError(false);
    try {
      setResult(await runRuntimeSuperMemoImport(source.filePath, percent, gradeMap, draft.preview.previewSignature, sourceFormat,
        draft.preview.directoryUpdate?.signature, withdrawSourceIds, target, source.collectionDirectory ?? null));
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

  const { busy, error, setPercent } = state;
  return { draft, percent, setPercent, source, busy, error, setError, result, gradeMap, sourceFormat,
    changeGrades, changeSourceFormat, importSource, ...createSourceActions(state) };
}
