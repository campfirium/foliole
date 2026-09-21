import { expect, it } from 'vitest';

import { classifyS220ResourceDiagnostic } from './macos-a5-s220-resource-diagnostic-classifier.mjs';

const image = { hash: 'a', local: { exists: true, hashMatches: true, size: 70 },
  resolver: { status: 'ready', resource_url: 'file:///a.png' },
  fetch: { ok: true, bytes: 70 }, dom: { complete: true, naturalWidth: 1 },
  decode: { status: 'decoded' } };

it('localizes resolver, local URL, decode, and widget-ready facts without retrying', () => {
  expect(classifyS220ResourceDiagnostic([image]).resultStatus).toBe('healthy');
  expect(classifyS220ResourceDiagnostic([{ ...image,
    resolver: { status: 'missing_file' } }]).failures).toEqual(['native_resolver']);
  expect(classifyS220ResourceDiagnostic([{ ...image,
    fetch: { ok: false, bytes: 0 } }]).failures).toEqual(['local_url_handler']);
  expect(classifyS220ResourceDiagnostic([{ ...image,
    dom: { complete: true, naturalWidth: 0 }, decode: { status: 'rejected' } }]).failures)
    .toEqual(['webview_decode']);
  expect(classifyS220ResourceDiagnostic([{ ...image,
    dom: { complete: true, naturalWidth: 0 } }]).failures).toEqual(['editor_widget']);
});
