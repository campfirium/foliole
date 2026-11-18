import { useEffect } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { SuperMemoMigrationForm, SuperMemoMigrationPanel } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import {
  clearRuntimeSuperMemoSourceSelection, connectRuntimeSuperMemoSource, getRuntimeSuperMemoSourceSelection,
  previewRuntimeSuperMemoImport, readRuntimeRememberedSuperMemoSource, readRuntimeSuperMemoComparison, saveRuntimeSuperMemoPanel
} from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { loadDraftWithSavedFormat, previewFailure, type DraftTarget, type Source } from './superMemoDraftSourceActions';
import type { DraftState } from './useSuperMemoDraft';

export const initialSourceFormat: SuperMemoSourceFormat = { ...DEFAULT_SUPER_MEMO_SOURCE_FORMAT, placement: 'topic-info' };

function useRestorePanel(state: DraftState) {
  const { setBusy, setError, setRemembered, setPercent, setSourceFormat, setGradeMap } = state;
  useEffect(() => {
    let active = true;
    void getRuntimeSuperMemoSourceSelection().then(selection => {
      if (!active || !selection) return;
      setRemembered(selection);
      setPercent(selection.savedForm.percent);
      setSourceFormat(selection.savedForm.sourceFormat);
      if (selection.savedForm.gradeMap) setGradeMap(selection.savedForm.gradeMap);
    }).catch(() => {
      if (active) setError('selectionRead');
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [setBusy, setError, setGradeMap, setPercent, setRemembered, setSourceFormat]);
}

export function useSuperMemoSourceSelection(state: DraftState, open: boolean) {
  const { remembered, setBusy, setError, setRemembered } = state;
  const filePath = remembered?.filePath;
  const collectionDirectory = remembered?.collectionDirectory;
  useRestorePanel(state);
  useEffect(() => {
    if (open && filePath) void connectRuntimeSuperMemoSource().catch(() => {
      // The preview checks access when requested, so a source that comes back is usable.
    });
  }, [open, filePath, collectionDirectory]);

  async function savePanel(panel: SuperMemoMigrationPanel) {
    if (!remembered) return;
    setRemembered(current => current && { ...current, panel: { ...current.panel, ...panel } });
    try {
      await saveRuntimeSuperMemoPanel(remembered, panel);
    } catch {
      setError('save');
    }
  }

  function clearPreview() {
    state.setResult(undefined);
    state.setDraft(undefined);
    state.setTarget(undefined);
    state.setPending(undefined);
    setError(false);
  }

  async function removeSelection() {
    if (state.busy) return;
    setBusy(true);
    try {
      await clearRuntimeSuperMemoSourceSelection();
      setRemembered(undefined);
      state.setSource(undefined);
      clearPreview();
      state.setPercent(0);
      state.setSourceFormat(initialSourceFormat);
    } catch {
      setError('save');
    } finally {
      setBusy(false);
    }
  }

  function resetCompletedDraft() {
    const { percent, sourceFormat, gradeMap, draft } = state;
    setRemembered(current => current && { ...current,
      savedForm: { ...current.savedForm, percent, sourceFormat, gradeMap, folderChoices: draft?.folderChoices } });
    clearPreview();
  }

  return { resetCompletedDraft, removeSelection, savePanel,
    prepareRememberedSource: () => prepareRememberedSource(state, savePanel) };
}

async function prepareRememberedSource(state: DraftState, savePanel: (panel: SuperMemoMigrationPanel) => Promise<void>) {
  const { gradeMap, percent, sourceFormat, setBusy, setError, setPending, setDraft } = state;
  if (state.busy || state.draft || !state.remembered) return;
  setBusy(true);
  setError(false);
  setPending(undefined);
  let linked: Source | null = null;
  try {
    linked = state.source ? { ...state.source, savedForm: state.remembered.savedForm }
      : await readRuntimeRememberedSuperMemoSource();
    if (!linked?.savedForm) throw new Error('supermemo_source_changed');
    const saved = { ...linked.savedForm, gradeMap, percent, sourceFormat };
    linked = { ...linked, savedForm: saved };
    if (linked.collectionDiscoveryFailure) throw new Error('supermemo_collection_unreadable');
    const restored = await restorePreview(linked, saved, gradeMap);
    state.setSource(linked);
    state.setTarget(restored.target);
    setDraft(restored.draft);
    const batch = restored.draft.preview.directoryUpdate;
    await savePanel({ elementCount: restored.draft.elements.length, ...(batch ? { batchId: batch.batchId } : {}) });
  } catch (error) {
    let reason = previewFailure(error);
    if (linked?.savedForm && reason.startsWith('collection')) {
      try {
        const target = await restoreTarget(linked.savedForm);
        setPending({ selected: linked, target });
      } catch {
        reason = 'xmlRead';
      }
    }
    setError(isImportAccessDenied(error) ? 'xmlAccess' : reason === 'preview' ? 'xmlRead' : reason);
  } finally {
    setBusy(false);
  }
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
