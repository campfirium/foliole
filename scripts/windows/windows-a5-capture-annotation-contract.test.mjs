// @vitest-environment node

import fs from 'node:fs';
import { expect, it } from 'vitest';

import {
  CAPTURE_ANNOTATION_RUNNER_IDENTITY, CAPTURE_ANNOTATION_TEST_CLASS,
  parseCaptureAnnotationInstrumentation, parseCaptureAnnotationPackage,
  parseCaptureAnnotationReadiness
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
    'instrumentation:com.campfirium.foliole.android.test/androidx.test.runner.AndroidJUnitRunner (target=com.campfirium.foliole.android)'
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

it('accepts only bounded readiness evidence without credential values', () => {
  const readiness = {
    canonicalInbox: { active: false, kind: null },
    counts: { content_blobs: 0, parent_child_order: 0, nodes: 0 },
    missingPrerequisites: ['acceptance_workspace_empty'],
    pairingWorkspace: { localDeviceIdentityPresent: false, syncEndpointPresent: false },
    resultStatus: 'approval_required', schemaVersion: 1
  };
  expect(parseCaptureAnnotationReadiness(
    `[android-data] capture-annotation-readiness=${JSON.stringify({ ...readiness, endpointSecret: 'omit-me' })}\n`
  )).toEqual(readiness);
  expect(() => parseCaptureAnnotationReadiness('[android-data] database=present\n'))
    .toThrow('evidence is missing');
});

it('requires a complete installed package identity', () => {
  const details = [
    'Package [com.campfirium.foliole.android] (abc):', '  versionCode=1 minSdk=26',
    '  versionName=1.0', '  firstInstallTime=2026-07-31 10:00:00',
    '  lastUpdateTime=2026-07-31 11:00:00'
  ].join('\n');
  expect(parseCaptureAnnotationPackage(
    'com.campfirium.foliole.android', details, 'package:/data/app/com.campfirium.foliole.android/base.apk\n'
  )).toMatchObject({ packageName: 'com.campfirium.foliole.android', versionCode: '1', versionName: '1.0' });
  expect(() => parseCaptureAnnotationPackage('com.campfirium.foliole.android', details, ''))
    .toThrow('identity is incomplete');
});

it('updates controlled WebView fields through the native setter before input events', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionWebViewSemanticAdapter.java',
    'utf8'
  );
  const setter = "Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value')";
  expect(source).toContain(setter);
  expect(source.indexOf(setter)).toBeLessThan(source.indexOf("dispatchEvent(new Event('input'"));
});
