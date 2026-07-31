// @vitest-environment node

import { expect, it } from 'vitest';

import {
  CAPTURE_ANNOTATION_RUNNER_IDENTITY, CAPTURE_ANNOTATION_TEST_CLASS,
  parseCaptureAnnotationInstrumentation, parseCaptureAnnotationPackage
} from './windows-a5-capture-annotation-contract.mjs';

function instrumentationOutput(token) {
  const receipt = {
    captureCreated: true, clozeCreated: true, hydratedAfterRestart: true,
    noteCreated: true, ok: true, targetTestId: 'companion-capture-annotation-persistence', token
  };
  return [
    `INSTRUMENTATION_STATUS: folioleActionReceipt=${JSON.stringify(receipt)}`,
    'INSTRUMENTATION_STATUS: folioleAfterSemantic={"elements":[],"url":"capacitor://localhost"}',
    'INSTRUMENTATION_CODE: -1'
  ].join('\n');
}

it('locks the exact runner, method, token receipt, and restart evidence', () => {
  expect(CAPTURE_ANNOTATION_RUNNER_IDENTITY).toBe(
    'instrumentation:com.foliole.android.test/androidx.test.runner.AndroidJUnitRunner (target=com.foliole.android)'
  );
  expect(CAPTURE_ANNOTATION_TEST_CLASS).toBe(
    'com.foliole.android.FolioleCompanionWebViewAutomationTest#persistsCaptureClozeAndNoteAfterRestart'
  );
  expect(parseCaptureAnnotationInstrumentation(instrumentationOutput('capture-run-1'), 'capture-run-1'))
    .toMatchObject({ receipt: { hydratedAfterRestart: true, token: 'capture-run-1' } });
  expect(() => parseCaptureAnnotationInstrumentation(
    instrumentationOutput('other-run'), 'capture-run-1'
  )).toThrow('belongs to another run');
});

it('requires a complete installed package identity', () => {
  const details = [
    'Package [com.foliole.android] (abc):', '  versionCode=1 minSdk=26',
    '  versionName=1.0', '  firstInstallTime=2026-07-31 10:00:00',
    '  lastUpdateTime=2026-07-31 11:00:00'
  ].join('\n');
  expect(parseCaptureAnnotationPackage(
    'com.foliole.android', details, 'package:/data/app/com.foliole.android/base.apk\n'
  )).toMatchObject({ packageName: 'com.foliole.android', versionCode: '1', versionName: '1.0' });
  expect(() => parseCaptureAnnotationPackage('com.foliole.android', details, ''))
    .toThrow('identity is incomplete');
});
