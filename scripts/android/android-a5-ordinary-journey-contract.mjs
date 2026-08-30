import path from 'node:path';

export const A5_ORDINARY_APP_ID = 'com.foliole.android.acceptance';
export const A5_ORDINARY_TEST_APP_ID = `${A5_ORDINARY_APP_ID}.test`;
export const A5_ORDINARY_TEST_CLASS_NAME =
  'com.foliole.android.FolioleCompanionWebViewAutomationTest';
export const A5_ORDINARY_TEST_METHOD = 'persistsOrdinaryCaptureAfterRelaunch';
export const A5_ORDINARY_TEST_CLASS =
  `${A5_ORDINARY_TEST_CLASS_NAME}#${A5_ORDINARY_TEST_METHOD}`;
export const A5_ORDINARY_TEST_RUNNER =
  `${A5_ORDINARY_TEST_APP_ID}/androidx.test.runner.AndroidJUnitRunner`;
export const A5_ORDINARY_EVIDENCE_FILES = [
  'ordinary-journey-manifest.json',
  'ordinary-journey-receipt.json',
  'ordinary-journey-semantic-snapshot.json'
];

export function ordinaryJourneyFailure(message, stage, result) {
  return Object.assign(new Error(message), { exitCode: 74, result, stage });
}

function parseBundleJson(output, key) {
  const prefix = `INSTRUMENTATION_STATUS: ${key}=`;
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) throw ordinaryJourneyFailure(`Instrumentation did not emit ${key}`, 'instrumentation-evidence');
  try { return JSON.parse(line.slice(prefix.length)); }
  catch { throw ordinaryJourneyFailure(`Instrumentation emitted invalid ${key}`, 'instrumentation-evidence'); }
}

export function parseA5OrdinaryJourneyInstrumentation(output, token) {
  if (!/^INSTRUMENTATION_CODE: -1$/mu.test(output)) {
    throw ordinaryJourneyFailure('A5 ordinary journey instrumentation failed', 'instrumentation');
  }
  const receipt = parseBundleJson(output, 'folioleActionReceipt');
  const semanticSnapshot = parseBundleJson(output, 'folioleAfterSemantic');
  const required = [
    'captureCreated', 'syncedContentVisible', 'visibleBeforeRelaunch', 'visibleAfterRelaunch'
  ];
  if (receipt.ok !== true || receipt.token !== token
      || receipt.targetTestId !== 'companion-ordinary-journey'
      || required.some((key) => receipt[key] !== true)) {
    throw ordinaryJourneyFailure(
      'A5 ordinary journey evidence is incomplete or belongs to another run',
      'instrumentation-evidence'
    );
  }
  if (!semanticSnapshot || typeof semanticSnapshot !== 'object') {
    throw ordinaryJourneyFailure('A5 ordinary journey semantic snapshot is missing', 'instrumentation-evidence');
  }
  return { receipt, semanticSnapshot };
}

export function ordinaryJourneyArtifactPaths(evidenceRoot) {
  return Object.fromEntries(A5_ORDINARY_EVIDENCE_FILES.map(
    (name) => [name, path.join(evidenceRoot, name)]
  ));
}
