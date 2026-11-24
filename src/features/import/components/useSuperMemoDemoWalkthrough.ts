import { useState } from 'react';

import { applySuperMemoFolderDisplay } from '../../../../lib/core/import/superMemoImportStructure';
import { DEFAULT_SUPER_MEMO_PRIORITY_BOUNDARIES } from '../../../../lib/core/import/superMemoPriorityMapping';
import { DEFAULT_SUPER_MEMO_GRADE_MAP, type SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { createSuperMemoDemoCollection } from '../model/superMemoDemoCollection';

import { useSuperMemoPreviewNavigation } from './SuperMemoEntryPreview';
import type { SuperMemoMigrationStep } from './SuperMemoMigrationSteps';

// Everything here lives only as long as the dialog is open; nothing is written or persisted.
export function useSuperMemoDemoWalkthrough() {
  const [collection, setCollection] = useState(createSuperMemoDemoCollection);
  const [step, setStep] = useState<SuperMemoMigrationStep>('load');
  const [percent, setPercent] = useState(0);
  const [boundaries, setBoundaries] = useState<readonly number[]>(DEFAULT_SUPER_MEMO_PRIORITY_BOUNDARIES);
  const [gradeMap, setGradeMap] = useState<SuperMemoGradeMap>(DEFAULT_SUPER_MEMO_GRADE_MAP);
  const navigation = useSuperMemoPreviewNavigation(undefined);

  function changeFolder(id: number, folder: boolean) {
    setCollection(current => ({
      ...current,
      preview: {
        ...current.preview,
        rows: current.preview.rows.map(row => row.id === id ? applySuperMemoFolderDisplay(row, folder) : row)
      }
    }));
  }

  return {
    ...collection, step, setStep, percent, setPercent, boundaries, setBoundaries,
    gradeMap, setGradeMap, navigation, changeFolder
  };
}

export type SuperMemoDemoWalkthrough = ReturnType<typeof useSuperMemoDemoWalkthrough>;
