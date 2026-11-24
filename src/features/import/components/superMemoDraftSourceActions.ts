import { DEFAULT_SUPER_MEMO_PRIORITY_BOUNDARIES } from '../../../../lib/core/import/superMemoPriorityMapping';
import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { NativeSuperMemoSource, SuperMemoMigrationForm } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import { activateSavedRuntimeSuperMemoSource, previewRuntimeSuperMemoImport, readRuntimeRememberedSuperMemoSource, selectRuntimeSuperMemoCollection,
  pickRuntimeSuperMemoSource, readRuntimeSuperMemoSource, reloadRuntimeSuperMemoSource, type SuperMemoUpdateTarget } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { previewFailure, superMemoNoticeKind, type SuperMemoNotice } from './superMemoNotice';
import { mappedSourceFormat, migrationSnapshot, rememberDraftSource, restoreSuperMemoDraft } from './superMemoSavedDraft';
import type { DraftState } from './useSuperMemoDraft';

export type Source = NativeSuperMemoSource;
type Candidate = NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoCollection>>>[number];
export type DraftTarget = SuperMemoUpdateTarget & { targetBatchId: string; originalFilePath?: string | undefined };
export type Pending = { selected: Source; target: DraftTarget | undefined; candidates?: Candidate[] };

export const automaticSourceFormat: SuperMemoSourceFormat = { ...DEFAULT_SUPER_MEMO_SOURCE_FORMAT, placement: 'topic-info' };

function comparisonForm(target: DraftTarget | undefined) {
  const comparison: SuperMemoMigrationForm['comparison'] = target
    ? { batchId: target.targetBatchId, originalFilePath: target.originalFilePath } : undefined;
  return comparison ? { comparison } : {};
}

function createCandidateLoader(state: DraftState, initialGrades: SuperMemoGradeMap) {
  const { setGradeMap, setTarget, setSourceFormat, setDraft, setSource, setPercent, setPending, setError, setRemembered, setPriorityBoundaries } = state;
  async function prepare(selected: Source, nextTarget: DraftTarget | undefined) {
    const sameSource = Boolean(nextTarget || selected.filePath === state.remembered?.filePath);
    const prior = sameSource ? state.sourceFormat : mappedSourceFormat;
    const initial = selected.savedForm?.sourceFormat ?? (prior.referenceMap ? prior : mappedSourceFormat);
    const gradeMap = selected.savedForm?.gradeMap ?? (sameSource ? state.gradeMap : initialGrades);
    const choices = selected.savedForm?.folderChoices ?? (sameSource ? state.draft?.folderChoices : undefined);
    const preview = (format: SuperMemoSourceFormat) => previewRuntimeSuperMemoImport(selected.draft?.elements ?? selected.xml,
      selected.collectionDirectory, gradeMap, format, nextTarget, choices);
    const loaded = await preview(initial);
    const match = loaded.preview.directoryUpdate?.sourceMatch;
    if (match && match.status !== 'verified') throw new Error('supermemo_source_mismatch');
    const sourceFormat = sameSource
      ? state.sourceFormat : loaded.preview.directoryUpdate?.sourceFormat ?? (loaded.preview.directoryUpdate ? automaticSourceFormat : initial);
    const draft = JSON.stringify(initial) === JSON.stringify(sourceFormat) ? loaded : await preview(sourceFormat);
    return { ...draft, sourceFormat, gradeMap };
  }

  async function show(selected: Source, nextTarget: DraftTarget | undefined, loaded: Awaited<ReturnType<typeof prepare>>) {
    const { filePath, name, collectionDirectory } = selected;
    const { sourceFormat, gradeMap } = loaded;
    const update = loaded.preview.directoryUpdate;
    const sameExport = filePath === state.remembered?.filePath;
    const percent = nextTarget || sameExport ? state.percent : selected.savedForm?.percent ?? update?.savedPercent ?? 0;
    const priorityBoundaries = nextTarget || sameExport
      ? state.priorityBoundaries : selected.savedForm?.priorityBoundaries ?? DEFAULT_SUPER_MEMO_PRIORITY_BOUNDARIES;
    const savedForm = { percent, sourceFormat, gradeMap, priorityBoundaries,
      folderChoices: loaded.folderChoices, ...comparisonForm(nextTarget) };
    const panel = { ...(sameExport ? state.remembered?.panel : undefined),
      step: 'structure' as const,
      elementCount: loaded.elements.length, batchId: update?.batchId };
    const snapshot = migrationSnapshot(loaded);
    await rememberDraftSource(selected, savedForm, false, panel, snapshot, selected.xmlHash);
    setRemembered({ filePath, name, collectionDirectory, savedForm, panel, snapshot });
    setTarget(nextTarget);
    setSourceFormat(sourceFormat);
    setGradeMap(gradeMap);
    setDraft({ elements: loaded.elements, preview: loaded.preview, folderChoices: loaded.folderChoices });
    setSource({ ...selected, xml: '', draft: { elements: loaded.elements, originalElements: nextTarget?.originalElements } });
    setPercent(percent);
    setPriorityBoundaries(priorityBoundaries);
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

function comparisonTarget({ draft, source, target, remembered }: DraftState): DraftTarget | undefined {
  const update = draft?.preview.directoryUpdate;
  const batchId = update?.batchId ?? remembered?.panel?.batchId;
  if (!batchId) return undefined;
  return target ?? {
    targetBatchId: batchId,
    ...(!update?.sourceMatch && source && draft ? { originalElements: draft.elements, originalFilePath: source.filePath } : {})
  };
}

async function pickAndReadSource(state: DraftState, asUpdate: boolean, initialGrades: SuperMemoGradeMap) {
  if (asUpdate && state.remembered) {
    state.setLoadingXml(true);
    return reloadRuntimeSuperMemoSource();
  }
  const filePath = await pickRuntimeSuperMemoSource();
  if (!filePath || filePath === state.remembered?.filePath) return null;
  state.setLoadingXml(true);
  const remembered = await activateSavedRuntimeSuperMemoSource(filePath);
  if (!remembered) return readRuntimeSuperMemoSource(filePath);
  restoreSuperMemoDraft(state, remembered, initialGrades);
  return null;
}

export function createSourceActions(state: DraftState, pickerTitle: string, initialGrades: SuperMemoGradeMap) {
  const { pending, busy, setBusy, setError, setPending, retryAsUpdate, setRetryAsUpdate } = state;
  const loader = createCandidateLoader(state, initialGrades);
  const { recover, resolveCandidates } = createCollectionRecovery(state, pickerTitle, loader);
  async function loadSource(asUpdate = false) {
    setBusy(true);
    setError(false);
    setPending(undefined);
    setRetryAsUpdate(asUpdate);
    try {
      const selected = await pickAndReadSource(state, asUpdate, initialGrades);
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
        if (!superMemoNoticeKind(reason)?.startsWith('collection')) {
          setError(reason);
          return;
        }
      }
      const recovery = { selected, target: nextTarget };
      try {
        if (selected.collectionCandidates?.length && await resolveCandidates(recovery, selected.collectionCandidates, false)) return;
        state.setLoadingXml(false);
        await recover(recovery, true, true);
      } catch (error) {
        setPending(recovery);
        setError(previewFailure(error, isImportAccessDenied(error) ? 'collectionAccess' : 'collectionRead'));
      }
    } catch (error) {
      setError(previewFailure(error, isImportAccessDenied(error) ? 'xmlAccess' : 'xmlRead'));
    } finally {
      state.setLoadingXml(false);
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
      setError(previewFailure(error, isImportAccessDenied(error) ? 'collectionAccess' : 'preview'));
    } finally {
      setBusy(false);
    }
  }
  return { loadSource, recoverCollection, pairCollection: () => pairCollection(state, recoverCollection), retrySource: () => loadSource(retryAsUpdate) };
}

function pairCollection(state: DraftState, recover: (choice: boolean, pending: Pending) => Promise<void>) {
  if (!state.source || !state.draft) return;
  const savedForm = { percent: state.percent, sourceFormat: state.sourceFormat, priorityBoundaries: state.priorityBoundaries, folderChoices: state.draft.folderChoices };
  return recover(true, { selected: { ...state.source, savedForm }, target: state.target });
}
