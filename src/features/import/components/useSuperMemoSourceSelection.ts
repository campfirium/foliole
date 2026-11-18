import { useEffect } from 'react';

import { applySuperMemoFolderDisplay } from '../../../../lib/core/import/superMemoImportStructure';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { SuperMemoMigrationPanel, SuperMemoMigrationSnapshot } from '../../../../lib/platform/nativeSuperMemoImportContract';
import {
  getRuntimeSuperMemoSourceSelection, saveRuntimeSuperMemoPanel
} from '../../../shared/platform/import/superMemoImportRuntimeRepository';

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
      const { elements, preview } = selection.snapshot;
      const folderChoices = selection.savedForm.folderChoices ?? [];
      const overrides = new Map(folderChoices.map(choice => [choice.id, choice.folder]));
      const rows = preview.directoryUpdate ? preview.rows : preview.rows.map(row =>
        applySuperMemoFolderDisplay(row, overrides.get(row.id) ?? row.sourceType === 'Concept'));
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
  }, [setBusy, setDraft, setError, setGradeMap, setPercent, setRemembered, setSource, setSourceFormat]);
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
