import { useEffect } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoMigrationPanel, SuperMemoMigrationSnapshot } from '../../../../lib/platform/nativeSuperMemoImportContract';
import {
  getRuntimeSuperMemoSourceSelection, saveRuntimeSuperMemoPanel
} from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { restoreSuperMemoDraft } from './superMemoSavedDraft';
import type { DraftState } from './useSuperMemoDraft';

function useRestorePanel(state: DraftState, initialGrades: SuperMemoGradeMap) {
  const { setBusy, setError, setRemembered, setPercent, setSourceFormat, setGradeMap, setSource, setDraft, setTarget } = state;
  useEffect(() => {
    let active = true;
    void getRuntimeSuperMemoSourceSelection().then(selection => {
      if (!active || !selection) return;
      restoreSuperMemoDraft({ setRemembered, setPercent, setSourceFormat, setGradeMap, setSource, setDraft, setTarget },
        selection, initialGrades);
    }).catch(() => {
      if (active) setError('selectionRead');
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [initialGrades, setBusy, setDraft, setError, setGradeMap, setPercent, setRemembered, setSource, setSourceFormat, setTarget]);
}

export function useSuperMemoSourceSelection(state: DraftState, initialGrades: SuperMemoGradeMap) {
  const { remembered, setError, setRemembered } = state;
  useRestorePanel(state, initialGrades);

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
