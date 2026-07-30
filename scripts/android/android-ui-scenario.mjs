/* Pure mapping from stable UI scenario identity to instrumentation test class. */

const APP_ID = 'com.foliole.android';
export const CAPTURE_ANNOTATION_SCENARIO_ID = 'companion-capture-annotation-persistence';

export function resolveUiAutomationTestClass(testId) {
  return testId === CAPTURE_ANNOTATION_SCENARIO_ID
    ? `${APP_ID}.FolioleCompanionWebViewAutomationTest#persistsCaptureClozeAndNoteAfterRestart`
    : `${APP_ID}.FolioleCompanionWebViewAutomationTest#performsBoundedSemanticAction`;
}
