import { expect, it } from 'vitest';

import {
  CAPTURE_ANNOTATION_SCENARIO_ID, resolveUiAutomationTestClass
} from './windows-android-lab-ui-scenario.mjs';

it('routes only the fixed Capture/Cloze/Note acceptance identity to the restart scenario', () => {
  expect(resolveUiAutomationTestClass(CAPTURE_ANNOTATION_SCENARIO_ID))
    .toContain('#persistsCaptureClozeAndNoteAfterRestart');
  expect(resolveUiAutomationTestClass('companion-tab-settings'))
    .toContain('#performsBoundedSemanticAction');
});
