import { useEffect } from 'react';

import { applySuperMemoFolderDisplay } from '../../../../lib/core/import/superMemoImportStructure';
import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { SuperMemoMigrationForm, SuperMemoMigrationPanel, SuperMemoMigrationSnapshot } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { isImportAccessDenied } from '../../../shared/platform/import/importAccess';
import {
  clearRuntimeSuperMemoSourceSelection, getRuntimeSuperMemoSourceSelection,
  previewRuntimeSuperMemoImport, readRuntimeRememberedSuperMemoSource, saveRuntimeSuperMemoPanel
} from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { loadDraftWithSavedFormat, previewFailure, type DraftTarget, type Source } from './superMemoDraftSourceActions';
import type { DraftState } from './useSuperMemoDraft';

export const initialSourceFormat: SuperMemoSourceFormat = { ...DEFAULT_SUPER_MEMO_SOURCE_FORMAT, placement: 'topic-info' };

function useRestorePanel(state: DraftState) {
  const { setBusy, setError, setRemembered, setPercent, setSourceFormat, setGradeMap, setSource, setDraft } = state;
  useEffect(() => {
    let active = true;
    void getRuntimeSuperMemoSourceSelection().then(selection => {
      if (!active || !selection) return;
      setRemembered(selection);
      setPercent(selection.savedForm.percent);
      setSourceFormat(selection.savedForm.sourceFormat);
      if (selection.savedForm.gradeMap) setGradeMap(selection.savedForm.gradeMap);
      if (selection.snapshot) {
        const { elements, preview } = selection.snapshot;
        const folderChoices = selection.savedForm.folderChoices ?? [];
        const overrides = new Map(folderChoices.map(choice => [choice.id, choice.folder]));
        const rows = preview.directoryUpdate ? preview.rows : preview.rows.map(row => applySuperMemoFolderDisplay(row, overrides.get(row.id)));
        setSource({ ...selection, xml: '' });
        setDraft({ preview: { ...preview, rows }, elements: elements.map(element => ({
          ...element, bodyOrQuestionHtml: [], answerHtml: []
        })), folderChoices });
      }
    }).catch(() => {
      if (active) setError('selectionRead');
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [setBusy, setDraft, setError, setGradeMap, setPercent, setRemembered, setSource, setSourceFormat]);
}

export function useSuperMemoSourceSelection(state: DraftState) {
  const { remembered, setBusy, setError, setRemembered } = state;
  useRestorePanel(state);

  async function savePanel(panel: SuperMemoMigrationPanel, snapshot?: SuperMemoMigrationSnapshot) {
    if (!remembered) return;
    setRemembered(current => current && { ...current, panel: { ...current.panel, ...panel }, ...(snapshot ? { snapshot } : {}) });
    try {
      if (snapshot) await saveRuntimeSuperMemoPanel(remembered, panel, snapshot);
      else await saveRuntimeSuperMemoPanel(remembered, panel);
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
    state.setResult(undefined);
    state.setPending(undefined);
    setError(false);
  }

  return { resetCompletedDraft, removeSelection, savePanel,
    prepareRememberedSource: (reportError = () => true) => prepareRememberedSource(state, savePanel, reportError) };
}

async function prepareRememberedSource(state: DraftState, savePanel: (panel: SuperMemoMigrationPanel) => Promise<void>, reportError: () => boolean) {
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
        const target = restoreTarget(linked.savedForm, linked.draft?.originalElements);
        setPending({ selected: linked, target });
      } catch {
        reason = 'xmlRead';
      }
    }
    if (reportError()) setError(isImportAccessDenied(error) ? 'xmlAccess' : reason === 'preview' ? 'xmlRead' : reason);
  } finally {
    setBusy(false);
  }
}

function restoreTarget(form: SuperMemoMigrationForm, originalElements: NonNullable<Source['draft']>['originalElements']): DraftTarget | undefined {
  if (!form.comparison) return undefined;
  const { batchId, originalFilePath } = form.comparison;
  return { targetBatchId: batchId, originalFilePath,
    ...(originalElements ? { originalElements } : {}) };
}

async function restorePreview(source: Source, form: SuperMemoMigrationForm, gradeMap: SuperMemoGradeMap) {
  const { draft } = await loadDraftWithSavedFormat(source, gradeMap, form.sourceFormat, false);
  if (!form.comparison || draft.preview.directoryUpdate?.batchId === form.comparison.batchId) {
    return { draft, target: undefined };
  }
  const target = restoreTarget(form, source.draft?.originalElements);
  return { draft: await previewRuntimeSuperMemoImport(source.draft?.elements ?? source.xml, source.collectionDirectory, gradeMap, form.sourceFormat, target), target };
}
