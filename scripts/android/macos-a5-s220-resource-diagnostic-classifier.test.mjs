import { expect, it } from 'vitest';

import { classifyS220ResourceDiagnostic } from './macos-a5-s220-resource-diagnostic-classifier.mjs';

const image = { hash: 'a', local: { exists: true, hashMatches: true, size: 70 },
  resolver: { status: 'ready', resource_url: 'file:///a.png' },
  widget: { present: true, status: null },
  fetch: { ok: true, bytes: 70 }, dom: { complete: true, naturalWidth: 1 },
  decode: { status: 'decoded' } };
const document = { bodyReadable: true, loadedImages: 1 };

it('localizes the first failed resource boundary without retrying', () => {
  expect(classifyS220ResourceDiagnostic(document, [image]).resultStatus).toBe('healthy');
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    widget: { present: false } }]).failures).toEqual(['editor_viewport_projection']);
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    resolver: { status: 'missing_file' } }]).failures).toEqual(['native_resolver']);
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    dom: null, fetch: null, decode: null }]).failures).toEqual(['widget_local_url_handoff']);
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    fetch: { ok: false, bytes: 0 } }]).failures).toEqual(['widget_local_url_handoff']);
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    dom: { complete: true, naturalWidth: 0 }, decode: { status: 'rejected' } }]).failures)
    .toEqual(['webview_decode']);
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    dom: { complete: true, naturalWidth: 0 } }]).failures)
    .toEqual(['editor_widget_lifecycle']);
});

it('separates document readiness and an acceptance-oracle mismatch', () => {
  expect(classifyS220ResourceDiagnostic({ bodyReadable: false }, [image]).failures)
    .toEqual(['document_hydration_navigation']);
  expect(classifyS220ResourceDiagnostic({ bodyReadable: true, loadedImages: 0 }, [image]).failures)
    .toEqual(['acceptance_oracle']);
});
