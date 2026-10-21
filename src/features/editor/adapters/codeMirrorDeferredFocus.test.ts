import { afterEach, expect, it, vi } from 'vitest';

import { CodeMirrorDeferredFocus } from './codeMirrorDeferredFocus';

function editor(editable: boolean) {
  const contentDOM = document.createElement('div');
  contentDOM.setAttribute('contenteditable', String(editable));
  document.body.append(contentDOM);
  return { contentDOM, focus: vi.fn() };
}

function trigger() {
  const button = document.createElement('button');
  document.body.append(button);
  button.focus();
  return button;
}

afterEach(() => { document.body.replaceChildren(); });

it('focuses an editable editor immediately', () => {
  const view = editor(true);
  new CodeMirrorDeferredFocus(() => view).request();
  expect(view.focus).toHaveBeenCalledTimes(1);
});

it('focuses a loading editor once it becomes editable while focus stays on the trigger', () => {
  const view = editor(false);
  trigger();
  const focus = new CodeMirrorDeferredFocus(() => view);
  focus.request();
  expect(view.focus).not.toHaveBeenCalled();
  view.contentDOM.setAttribute('contenteditable', 'true');
  focus.resolve();
  focus.resolve();
  expect(view.focus).toHaveBeenCalledTimes(1);
});

it('does not take focus back after the user moved elsewhere during loading', () => {
  const view = editor(false);
  trigger();
  const focus = new CodeMirrorDeferredFocus(() => view);
  focus.request();
  trigger();
  view.contentDOM.setAttribute('contenteditable', 'true');
  focus.resolve();
  expect(view.focus).not.toHaveBeenCalled();
});
