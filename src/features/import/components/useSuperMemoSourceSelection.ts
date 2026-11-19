import { useEffect } from 'react';

import { applySuperMemoFolderDisplay, defaultSuperMemoFolder } from '../../../../lib/core/import/superMemoImportStructure';
import type { SuperMemoMigrationPanel, SuperMemoMigrationSnapshot } from '../../../../lib/platform/nativeSuperMemoImportContract';
import {
  getRuntimeSuperMemoSourceSelection, saveRuntimeSuperMemoPanel
} from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { mappedSourceFormat } from './superMemoDraftSourceActions';
import type { DraftState } from './useSuperMemoDraft';

function previewSourceFormat(update: unknown, format: typeof mappedSourceFormat) {
  return update || format.referenceMap ? format : mappedSourceFormat;
}

function useRestorePanel(state: DraftState) {
  const { setBusy, setError, setRemembered, setPercent, setSourceFormat, setGradeMap, setSource, setDraft, setTarget } = state;
  useEffect(() => {
    let active = true;
    void getRuntimeSuperMemoSourceSelection().then(selection => {
      if (!active || !selection) return;
      setRemembered(selection);
      setPercent(selection.savedForm.percent);
      // A saved update signature is tied to the format reviewed with that preview.
      const format = selection.savedForm.sourceFormat;
      setSourceFormat(previewSourceFormat(selection.snapshot.preview.directoryUpdate, format));
      if (selection.savedForm.gradeMap) setGradeMap(selection.savedForm.gradeMap);
      const { elements, preview } = selection.snapshot;
      const folderChoices = selection.savedForm.folderChoices ?? [];
      const overrides = new Map(folderChoices.map(choice => [choice.id, choice.folder]));
      const parents = new Set(elements.filter(element => element.children?.length).map(element => element.id));
      const rows = preview.directoryUpdate ? preview.rows : preview.rows.map(row =>
        applySuperMemoFolderDisplay(row, overrides.get(row.id) ??
          defaultSuperMemoFolder(row, parents.has(row.id), row.structure?.sourceHasBody)));
      const comparison = selection.savedForm.comparison;
      if (comparison) setTarget({ targetBatchId: comparison.batchId, originalFilePath: comparison.originalFilePath });
      setSource({ ...selection, xml: '' });
      setDraft({ preview: { ...preview, rows }, elements: elements.map(element => ({
        ...element, bodyOrQuestionHtml: [], answerHtml: []
      })), folderChoices });
    }).catch(() => {
      if (active) setError('selectionRead');
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [setBusy, setDraft, setError, setGradeMap, setPercent, setRemembered, setSource, setSourceFormat, setTarget]);
}

export function useSuperMemoSourceSelection(state: DraftState) {
  const { remembered, setError, setRemembered } = state;
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

  function resetCompletedDraft() {
    state.setResult(undefined);
    state.setPending(undefined);
    setError(false);
  }

  return { resetCompletedDraft, savePanel };
}
