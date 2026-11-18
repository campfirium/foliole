import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { NativeSuperMemoSource, SuperMemoMigrationForm, SuperMemoMigrationSnapshot, SuperMemoSourceLink, SuperMemoSourceSelection } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import { previewRuntimeSuperMemoImport, readRuntimeRememberedSuperMemoSource, saveRuntimeSuperMemoSourceLink, selectRuntimeSuperMemoCollection,
  selectRuntimeSuperMemoSource, type SuperMemoUpdateTarget } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import type { DraftState } from './useSuperMemoDraft';

export type Source = NativeSuperMemoSource;
type Candidate = NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoCollection>>>[number];
export type DraftTarget = SuperMemoUpdateTarget & { targetBatchId: string; originalFilePath?: string | undefined };
export type Pending = { selected: Source; target: DraftTarget | undefined; candidates?: Candidate[] };

export type SuperMemoNotice = false | 'selectionRead' | 'collectionChoice' | 'xmlAccess' | 'xmlUpdated' | 'xmlSize' | 'xmlRead' | 'xmlFormat' |
  'collectionAccess' | 'collectionRead' | 'collectionMismatch' | 'preview' | 'convert' | 'save';

export function previewFailure(error: unknown): Exclude<SuperMemoNotice, false> {
  const message = String(error);
  if (message.includes('supermemo_xml_updated') || message.includes('supermemo_collection_updated')) return 'xmlUpdated';
  if (message.includes('invalid_supermemo_xml_size')) return 'xmlSize';
  if (message.includes('supermemo_link_save_failed')) return 'save';
  if (message.includes('invalid_supermemo_xml')) return 'xmlFormat';
  if (message.includes('supermemo_collection_access_denied')) return 'collectionAccess';
  if (message.includes('supermemo_collection_mismatch')) return 'collectionMismatch';
  if (message.includes('supermemo_collection_unreadable')) return 'collectionRead';
  return 'preview';
}

export async function loadDraftWithSavedFormat(selected: NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoSource>>>,
  gradeMap: SuperMemoGradeMap, sourceFormat: SuperMemoSourceFormat, useBatchFormat = true) {
  const first = await previewRuntimeSuperMemoImport(selected.draft?.elements ?? selected.xml, selected.collectionDirectory, gradeMap, sourceFormat, undefined, selected.savedForm?.folderChoices);
  const savedFormat = useBatchFormat ? first.preview.directoryUpdate?.sourceFormat : undefined;
  const loaded = savedFormat && (savedFormat.placement !== sourceFormat.placement || savedFormat.template !== sourceFormat.template)
    ? await previewRuntimeSuperMemoImport(selected.draft?.elements ?? selected.xml, selected.collectionDirectory, gradeMap, savedFormat) : first;
  return { draft: loaded, sourceFormat: savedFormat ?? sourceFormat };
}

export async function rememberDraftSource(source: SuperMemoSourceSelection, form: SuperMemoMigrationForm, formOnly: boolean, panel?: SuperMemoSourceLink['panel'], snapshot?: SuperMemoMigrationSnapshot, xmlHash?: string) {
  const link = { filePath: source.filePath, collectionDirectory: source.collectionDirectory ?? null,
    ...form, ...(panel ? { panel } : {}) };
  try {
    await saveRuntimeSuperMemoSourceLink(link, formOnly, snapshot, xmlHash);
  } catch (error) {
    throw new Error('supermemo_link_save_failed', { cause: error });
  }
}

export function migrationSnapshot({ elements, preview }: Awaited<ReturnType<typeof previewRuntimeSuperMemoImport>>): SuperMemoMigrationSnapshot {
  const structuralElements = elements.map(({ id, parentId, children, sourceType, title, ordinal, skippedAudioComponents, learning }) =>
    ({ id, parentId, children, sourceType, title, ordinal, skippedAudioComponents, learning }));
  const rows = preview.rows.map(row => {
    const structuralRow = { ...row };
    delete structuralRow.sourceExample;
    return structuralRow;
  });
  return { elements: structuralElements, preview: { ...preview, rows } };
}

function comparisonForm(target: DraftTarget | undefined) {
  const comparison: SuperMemoMigrationForm['comparison'] = target
    ? { batchId: target.targetBatchId, originalFilePath: target.originalFilePath } : undefined;
  return comparison ? { comparison } : {};
}

function createCandidateLoader(state: DraftState) {
  const { gradeMap, sourceFormat, setTarget, setSourceFormat, setDraft, setSource, setPercent, setPending, setError, setRemembered } = state;
  async function prepare(selected: Source, nextTarget: DraftTarget | undefined) {
    const format = selected.savedForm?.sourceFormat ?? sourceFormat;
    return nextTarget
      ? { draft: await previewRuntimeSuperMemoImport(selected.draft?.elements ?? selected.xml, selected.collectionDirectory, gradeMap, format, nextTarget), sourceFormat: format }
      : loadDraftWithSavedFormat(selected, gradeMap, format, !selected.savedForm);
  }

  async function show(selected: Source, nextTarget: DraftTarget | undefined, loaded: Awaited<ReturnType<typeof prepare>>) {
    const percent = selected.savedForm?.percent ?? 0;
    const { filePath, name, collectionDirectory } = selected;
    const savedForm = { percent, sourceFormat: loaded.sourceFormat, gradeMap,
      folderChoices: loaded.draft.folderChoices, ...comparisonForm(nextTarget) };
    const update = loaded.draft.preview.directoryUpdate;
    const sameExport = filePath === state.remembered?.filePath;
    const panel = { ...(sameExport ? state.remembered?.panel : undefined),
      step: update ? 'load' as const : 'structure' as const,
      elementCount: loaded.draft.elements.length, batchId: update?.batchId };
    const snapshot = migrationSnapshot(loaded.draft);
    await rememberDraftSource(selected, savedForm, false, panel, snapshot, selected.xmlHash);
    setRemembered({ filePath, name, collectionDirectory, savedForm, panel, snapshot });
    setTarget(nextTarget);
    setSourceFormat(loaded.sourceFormat);
    setDraft(loaded.draft);
    setSource({ ...selected, xml: '', draft: { elements: loaded.draft.elements, originalElements: nextTarget?.originalElements } });
    setPercent(percent);
    setPending(undefined);
    setError(false);
  }

  return { prepare, show };
}

async function restoreRecoverySource(recovery: Pending): Promise<Pending> {
  if (recovery.selected.xml || recovery.selected.draft) return recovery;
  const restored = await readRuntimeRememberedSuperMemoSource(true);
  if (!restored || restored.filePath !== recovery.selected.filePath) throw new Error('supermemo_xml_updated');
  const { xml, xmlHash } = restored;
  return { ...recovery, selected: { ...recovery.selected, xml, ...(xmlHash ? { xmlHash } : {}) } };
}

function withCollection({ filePath, name, xml, xmlHash, savedForm, draft }: Source, collectionDirectory?: string): Source {
  return { filePath, name, xml, ...(xmlHash ? { xmlHash } : {}), collectionDirectory, ...(draft ? { draft } : {}), ...(savedForm ? { savedForm } : {}) };
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
      await show(withCollection(selected, matches[0]!.directory), target, first);
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

function comparisonTarget({ draft, source, target }: DraftState): DraftTarget | undefined {
  const update = draft?.preview.directoryUpdate;
  if (!update || !draft) return undefined;
  return target ?? {
    targetBatchId: update.batchId,
    ...(!update.sourceMatch && source ? { originalElements: draft.elements, originalFilePath: source.filePath } : {})
  };
}

export function createSourceActions(state: DraftState, pickerTitle: string) {
  const { source, target, pending, busy, setBusy, setError, setPending, retryAsUpdate, setRetryAsUpdate } = state;
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
      const nextTarget = asUpdate ? comparisonTarget(state) : undefined;
      try {
        const loaded = await loader.prepare(selected, nextTarget);
        if (selected.collectionDirectory && !selected.collectionDiscoveryFailure) {
          await loader.show(selected, nextTarget, loaded);
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
        setError(String(error).includes('supermemo_link_save_failed') ? 'save' : isImportAccessDenied(error) ? 'collectionAccess' : 'collectionRead');
      }
    } catch (error) {
      setError(isImportAccessDenied(error) ? 'xmlAccess' : /invalid_supermemo_xml_size/.test(String(error)) ? 'xmlSize' : 'xmlRead');
    } finally {
      setBusy(false);
    }
  }

  async function recoverCollection(choice: boolean | string, recovery = pending) {
    if (!recovery || busy) return;
    setBusy(true);
    try {
      await recover(await restoreRecoverySource(recovery), choice);
    } catch (error) {
      setPending(recovery);
      setError(isImportAccessDenied(error) ? 'collectionAccess' : previewFailure(error));
    } finally {
      setBusy(false);
    }
  }
  function pairCollection() {
    if (!source || !state.draft) return;
    const savedForm = { percent: state.percent, sourceFormat: state.sourceFormat, folderChoices: state.draft.folderChoices };
    return recoverCollection(true, { selected: { ...source, savedForm }, target });
  }

  return { loadSource, recoverCollection, pairCollection, retrySource: () => loadSource(retryAsUpdate) };
}
