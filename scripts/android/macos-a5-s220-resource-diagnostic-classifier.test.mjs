import { expect, it } from 'vitest';

import { classifyS220ResourceDiagnostic } from './macos-a5-s220-resource-diagnostic-classifier.mjs';

const image = { hash: 'a', local: { exists: true, hashMatches: true, size: 70 },
  resolver: { status: 'ready', resource_url: 'file:///a.png' },
  widget: { present: true, status: null },
  terminal: 'ready', dom: { complete: true, naturalWidth: 1 } };
const document = { bodyReadable: true, loadedImages: 1 };

it('localizes the first failed resource boundary without retrying', () => {
  expect(classifyS220ResourceDiagnostic(document, [image]).resultStatus).toBe('healthy');
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    widget: { present: false } }]).failures).toEqual(['editor_viewport_projection']);
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    resolver: { status: 'missing_file' } }]).failures).toEqual(['native_resolver']);
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    terminal: 'unavailable', dom: null }]).failures).toEqual(['widget_local_url_handoff']);
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    terminal: 'timeout', dom: null }]).failures).toEqual(['editor_widget_lifecycle_timeout']);
  expect(classifyS220ResourceDiagnostic(document, [{ ...image,
    terminal: null }]).failures).toEqual(['observer_contract']);
});

it('separates document readiness from per-image terminal states', () => {
  expect(classifyS220ResourceDiagnostic({ bodyReadable: false }, [image]).failures)
    .toEqual(['document_hydration_navigation']);
});
