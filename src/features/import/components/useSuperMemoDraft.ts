import { useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import { previewRuntimeSuperMemoImport, runRuntimeSuperMemoImport, saveSuperMemoGradeMap,
  selectRuntimeSuperMemoCollection, selectRuntimeSuperMemoSource, type SuperMemoUpdateTarget } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

type Source = NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoSource>>>;
type Candidate = NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoCollection>>>[number];
type Pending = { selected: Source; target: SuperMemoUpdateTarget | undefined; candidates?: Candidate[] };

export type SuperMemoNotice = false | 'collectionChoice' | 'xmlAccess' | 'xmlSize' | 'xmlRead' | 'xmlFormat' |
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
  const [pending, setPending] = useState<Pending>();

  return {
    target, setTarget, draft, setDraft, gradeMap, setGradeMap, sourceFormat, setSourceFormat, percent, setPercent,
    retryAsUpdate, setRetryAsUpdate, source, setSource, result, setResult, busy, setBusy, error, setError, pending, setPending
  };
}

type DraftState = ReturnType<typeof useDraftState>;

function createCandidateLoader(state: DraftState) {
  const { gradeMap, sourceFormat, setTarget, setSourceFormat, setDraft, setSource, setPercent, setPending, setError } = state;
  async function prepare(selected: Source, nextTarget: SuperMemoUpdateTarget | undefined) {
    return nextTarget
      ? { draft: await previewRuntimeSuperMemoImport(selected.xml, selected.collectionDirectory, gradeMap, sourceFormat, nextTarget), sourceFormat }
      : loadDraftWithSavedFormat(selected, gradeMap, sourceFormat);
  }

  function show(selected: Source, nextTarget: SuperMemoUpdateTarget | undefined, loaded: Awaited<ReturnType<typeof prepare>>) {
    setTarget(nextTarget);
    setSourceFormat(loaded.sourceFormat);
    setDraft(loaded.draft);
    setSource(selected);
    setPercent(0);
    setPending(undefined);
    setError(false);
  }

  return { prepare, show };
}

function withCollection({ filePath, name, xml }: Source, collectionDirectory?: string): Source {
  return { filePath, name, xml, collectionDirectory };
}

function createCollectionRecovery(state: DraftState, pickerTitle: string, loader: ReturnType<typeof createCandidateLoader>) {
  const { setPending, setError } = state;
  const { prepare, show } = loader;
  async function resolveCandidates({ selected, target }: Pending, candidates: Candidate[], reportFailure: boolean) {
    const matches: Candidate[] = [];
    let first: Awaited<ReturnType<typeof prepare>> | undefined;
    let reason: SuperMemoNotice = 'collectionRead';
    for (const candidate of candidates) {
      try {
        const loaded = await prepare(withCollection(selected, candidate.directory), target);
        first ??= loaded;
        matches.push(candidate);
      } catch (error) {
        reason = previewFailure(error);
      }
    }
    if (matches.length === 1 && first) {
      show(withCollection(selected, matches[0]!.directory), target, first);
      return true;
    }
    if (!matches.length && !reportFailure) return false;
    setPending({ selected, target, candidates: matches });
    setError(matches.length > 1 ? 'collectionChoice' : reason);
    return true;
  }

  async function recover({ selected, target }: Pending, choice: boolean | string, initial = false) {
    const showSource = async (source: Source) => show(source, target, await prepare(source, target));
    if (typeof choice === 'string' || !choice) {
      await showSource(withCollection(selected, typeof choice === 'string' ? choice : undefined));
      return;
    }

    const candidates = await selectRuntimeSuperMemoCollection(selected.filePath, pickerTitle, selected.collectionDirectory);
    if (!candidates) {
      // Canceling the initial picker still opens the XML preview.
      if (initial) await showSource(withCollection(selected));
      return;
    }

    await resolveCandidates({ selected, target }, candidates, true);
  }

  return { recover, resolveCandidates };
}

function createSourceActions(state: DraftState, pickerTitle: string) {
  const { draft, target, pending, busy, setBusy, setError, setPending, retryAsUpdate, setRetryAsUpdate } = state;
  const loader = createCandidateLoader(state);
  const { recover, resolveCandidates } = createCollectionRecovery(state, pickerTitle, loader);

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
      try {
        const loaded = await loader.prepare(selected, nextTarget);
        if (selected.collectionDirectory && !selected.collectionDiscoveryFailure) {
          loader.show(selected, nextTarget, loaded);
          return;
        }
      } catch (error) {
        const reason = previewFailure(error);
        if (!reason.startsWith('collection')) {
          setError(reason);
          return;
        }
      }
      const recovery = { selected, target: nextTarget };
      try {
        if (selected.collectionCandidates?.length && await resolveCandidates(recovery, selected.collectionCandidates, false)) return;
        await recover(recovery, true, true);
      } catch (error) {
        setPending(recovery);
        setError(isImportAccessDenied(error) ? 'collectionAccess' : 'collectionRead');
      }
    } catch (error) {
      setError(isImportAccessDenied(error) ? 'xmlAccess' : /invalid_supermemo_xml_size/.test(String(error)) ? 'xmlSize' : 'xmlRead');
    } finally {
      setBusy(false);
    }
  }

  async function recoverCollection(choice: boolean | string) {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await recover(pending, choice);
    } catch (error) {
      setError(isImportAccessDenied(error) ? 'collectionAccess' : previewFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return { loadSource, recoverCollection, retrySource: () => loadSource(retryAsUpdate) };
}

export function useSuperMemoDraft(initialGrades: SuperMemoGradeMap, pickerTitle: string) {
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

  function changeSourceFormat(next: SuperMemoSourceFormat) {
    if (!source || result || !draft?.preview.directoryUpdate) {
      setSourceFormat(next);
      return;
    }
    void refreshSourceFormat(async () => {
      setDraft(await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, gradeMap, next, target));
      setSourceFormat(next);
    }, setBusy, setError);
  }

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
  function resetCompletedDraft() {
    setDraft(undefined);
    state.setSource(undefined);
    state.setTarget(undefined);
    setResult(undefined);
    setPercent(0);
    setSourceFormat({ ...DEFAULT_SUPER_MEMO_SOURCE_FORMAT, placement: 'topic-info' });
  }

  return { draft, percent, setPercent, source, busy, error, setError, result, gradeMap, sourceFormat,
    changeGrades, changeSourceFormat, importSource, resetCompletedDraft, candidates: state.pending?.candidates, ...createSourceActions(state, pickerTitle) };
}
