import { afterEach, expect, it, vi } from 'vitest';

import { traceAndroidSelection, traceAndroidSelectionSnapshot } from './androidSelectionTrace';
import { serializeSupportLog, startSupportLog, stopSupportLog } from './supportLog';

vi.mock('../companionRuntimeCapabilities', () => ({ getCompanionRuntimeCapability: () => ({ kind: 'android-native' }) }));

afterEach(() => {
  stopSupportLog();
  localStorage.clear();
  document.body.replaceChildren();
  vi.unstubAllEnvs();
});

it.each(['annotation', 'off'] as const)('exports the %s capture with bounded recent events and no body text', mode => {
  localStorage.setItem('foliole-android-devanagari-selection-mode', mode);
  vi.stubEnv('VITE_FOLIOLE_SOURCE_REVISION', 'a'.repeat(40));
  const text = document.body.appendChild(document.createTextNode('क्षत्र private'));
  const native = window.getSelection()!;
  const collapse = native.collapse;
  startSupportLog();
  for (let index = 0; index < 600; index++) traceAndroidSelection('editor-update', [index]);
  native.setBaseAndExtent(text, 0, text, 6);
  traceAndroidSelectionSnapshot(node => node === text, 0, 6);
  native.collapse(text, 2);
  document.dispatchEvent(new CustomEvent('foliole-android-selection-action',
    { detail: { phase: 'destroy', occurredAt: Date.now() } }));
  stopSupportLog();
  expect(native.collapse).toBe(collapse);
  const json = serializeSupportLog('android')!;
  expect(json).not.toContain('private');
  expect(json).not.toContain('क्षत्र');
  const capture = JSON.parse(json).androidSelection;
  expect(capture).toMatchObject({ mode, build: 'a'.repeat(40), dropped: 92 });
  expect(capture.events).toHaveLength(512);
  expect(capture.events.slice(-4).map((entry: { kind: string }) => entry.kind))
    .toEqual(['setBaseAndExtent', 'selection', 'collapse', 'action-destroy']);
  expect(capture.events.at(-3).fields).toEqual([1, 3, 1, 1, 0, 1, 3, 1, 1, 6, 0, 6, 1, 0, 0, 6, 1]);
});
