import { afterEach, expect, it } from 'vitest';

import {
  FORMULA_CLOZE_PRESENTATION_CHANGE_EVENT,
  registerFormulaClozeEditorPresentation,
  unregisterFormulaClozeEditorPresentation
} from './formulaClozePresentation';

const presentation = { canCreate: true, hiddenRegionIds: [], outlinedRegionIds: [], regions: [] };

function recordNotifications() {
  const seen: string[] = [];
  const listener = (event: Event) => seen.push((event as CustomEvent<{ editorNodeId: string }>).detail.editorNodeId);
  window.addEventListener(FORMULA_CLOZE_PRESENTATION_CHANGE_EVENT, listener);
  return { seen, stop: () => window.removeEventListener(FORMULA_CLOZE_PRESENTATION_CHANGE_EVENT, listener) };
}

afterEach(() => unregisterFormulaClozeEditorPresentation('node-1'));

it('does not rebuild formula widgets when identical regions are registered again', () => {
  registerFormulaClozeEditorPresentation('node-1', presentation);
  const recorder = recordNotifications();
  registerFormulaClozeEditorPresentation('node-1', { ...presentation });
  recorder.stop();
  expect(recorder.seen).toEqual([]);
});

it('notifies for a changed presentation and for removal', () => {
  const recorder = recordNotifications();
  registerFormulaClozeEditorPresentation('node-1', presentation);
  registerFormulaClozeEditorPresentation('node-1', { ...presentation, canCreate: false });
  unregisterFormulaClozeEditorPresentation('node-1');
  recorder.stop();
  expect(recorder.seen).toEqual(['node-1', 'node-1', 'node-1']);
});
