import path from 'node:path';

export const CAPTURE_ANNOTATION_EVIDENCE_FILES = [
  'capture-annotation-manifest.json',
  'capture-annotation-receipt.json',
  'capture-annotation-semantic-snapshot.json',
  'capture-annotation-db-summary.json'
];

export const CAPTURE_ANNOTATION_APP_ID = 'com.foliole.android';
export const CAPTURE_ANNOTATION_TEST_APP_ID = `${CAPTURE_ANNOTATION_APP_ID}.test`;
export const CAPTURE_ANNOTATION_TEST_CLASS_NAME =
  `${CAPTURE_ANNOTATION_APP_ID}.FolioleCompanionWebViewAutomationTest`;
export const CAPTURE_ANNOTATION_TEST_METHOD = 'persistsCaptureClozeAndNoteAfterRestart';
export const CAPTURE_ANNOTATION_TEST_CLASS =
  `${CAPTURE_ANNOTATION_TEST_CLASS_NAME}#${CAPTURE_ANNOTATION_TEST_METHOD}`;
export const CAPTURE_ANNOTATION_TEST_RUNNER =
  `${CAPTURE_ANNOTATION_TEST_APP_ID}/androidx.test.runner.AndroidJUnitRunner`;
export const CAPTURE_ANNOTATION_RUNNER_IDENTITY =
  `instrumentation:${CAPTURE_ANNOTATION_TEST_RUNNER} (target=${CAPTURE_ANNOTATION_APP_ID})`;

export function captureAnnotationFailure(message, stage, result) {
  return Object.assign(new Error(message), { exitCode: 74, result, stage });
}

export function parseCaptureAnnotationReadiness(output) {
  const prefix = '[android-data] capture-annotation-readiness=';
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) throw captureAnnotationFailure('Capture annotation readiness evidence is missing', 'capture-readiness');
  let readiness;
  try { readiness = JSON.parse(line.slice(prefix.length)); }
  catch { throw captureAnnotationFailure('Capture annotation readiness evidence is invalid', 'capture-readiness'); }
  const counts = readiness?.counts;
  const pairing = readiness?.pairingWorkspace;
  if (readiness?.schemaVersion !== 1 || !['ready', 'approval_required'].includes(readiness.resultStatus)
      || !Array.isArray(readiness.missingPrerequisites) || !counts || !pairing
      || readiness.missingPrerequisites.some((entry) => typeof entry !== 'string')
      || ['content_blobs', 'node_order', 'nodes'].some(
        (key) => counts[key] !== null && !Number.isSafeInteger(counts[key])
      )
      || typeof readiness.canonicalInbox?.active !== 'boolean'
      || typeof pairing.localDeviceIdentityPresent !== 'boolean'
      || typeof pairing.syncEndpointPresent !== 'boolean') {
    throw captureAnnotationFailure('Capture annotation readiness evidence is incomplete', 'capture-readiness');
  }
  return {
    canonicalInbox: {
      active: readiness.canonicalInbox.active,
      kind: typeof readiness.canonicalInbox.kind === 'string' ? readiness.canonicalInbox.kind : null
    },
    counts: {
      content_blobs: counts.content_blobs, node_order: counts.node_order, nodes: counts.nodes
    },
    missingPrerequisites: [...readiness.missingPrerequisites],
    pairingWorkspace: {
      localDeviceIdentityPresent: pairing.localDeviceIdentityPresent,
      syncEndpointPresent: pairing.syncEndpointPresent
    },
    resultStatus: readiness.resultStatus,
    schemaVersion: 1
  };
}

function parseBundleJson(output, key) {
  const prefix = `INSTRUMENTATION_STATUS: ${key}=`;
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) throw captureAnnotationFailure(`Instrumentation did not emit ${key}`, 'instrumentation-evidence');
  try { return JSON.parse(line.slice(prefix.length)); }
  catch { throw captureAnnotationFailure(`Instrumentation emitted invalid ${key}`, 'instrumentation-evidence'); }
}

export function parseCaptureAnnotationInstrumentation(output, token) {
  if (!/^INSTRUMENTATION_CODE: -1$/mu.test(output)) {
    throw captureAnnotationFailure('Capture annotation instrumentation did not complete successfully', 'instrumentation');
  }
  const receipt = parseBundleJson(output, 'folioleActionReceipt');
  const semanticSnapshot = parseBundleJson(output, 'folioleAfterSemantic');
  const required = ['captureCreated', 'clozeCreated', 'noteCreated', 'hydratedAfterRestart'];
  if (receipt.ok !== true || receipt.token !== token
      || receipt.targetTestId !== 'companion-capture-annotation-persistence'
      || required.some((key) => receipt[key] !== true)) {
    throw captureAnnotationFailure(
      'Capture annotation receipt is incomplete or belongs to another run', 'instrumentation-evidence'
    );
  }
  if (!semanticSnapshot || typeof semanticSnapshot !== 'object') {
    throw captureAnnotationFailure('Restart semantic snapshot is missing', 'instrumentation-evidence');
  }
  return { receipt, semanticSnapshot };
}

function packageField(output, field) {
  return new RegExp(`^\\s*${field}=(.+)$`, 'mu').exec(output)?.[1]?.trim();
}

export function parseCaptureAnnotationPackage(packageName, detailsOutput, pathsOutput) {
  if (!String(detailsOutput).includes(`Package [${packageName}]`)) {
    throw captureAnnotationFailure(`Required installed package is missing: ${packageName}`, 'installed-package');
  }
  const codePaths = String(pathsOutput).split(/\r?\n/u)
    .filter((line) => line.startsWith('package:')).map((line) => line.slice('package:'.length).trim())
    .filter(Boolean);
  const identity = {
    codePaths, firstInstallTime: packageField(detailsOutput, 'firstInstallTime'),
    lastUpdateTime: packageField(detailsOutput, 'lastUpdateTime'), packageName,
    versionCode: packageField(detailsOutput, 'versionCode')?.split(/\s+/u)[0],
    versionName: packageField(detailsOutput, 'versionName')
  };
  if (codePaths.length === 0 || Object.values(identity).some((value) => value === undefined)) {
    throw captureAnnotationFailure(`Installed package identity is incomplete: ${packageName}`, 'installed-package');
  }
  return identity;
}

export function captureAnnotationArtifactPaths(evidenceRoot) {
  return Object.fromEntries(CAPTURE_ANNOTATION_EVIDENCE_FILES.map(
    (name) => [name, path.join(evidenceRoot, name)]
  ));
}
