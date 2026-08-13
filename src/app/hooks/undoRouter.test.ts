import { afterEach, expect, it } from 'vitest';

import {
  getUndoRouterOwner,
  resolveUndoRouterOwner,
  setUndoRouterOwner
} from './undoRouter';

afterEach(() => {
  document.body.replaceChildren();
  setUndoRouterOwner('workspace');
});

it('resolves the nearest declared content or workspace surface', () => {
  document.body.innerHTML = `
    <div data-undo-history-owner="workspace"><button id="list">List</button></div>
    <section data-undo-history-owner="content"><textarea id="editor"></textarea></section>
  `;

  expect(resolveUndoRouterOwner(document.querySelector('#list'))).toBe('workspace');
  expect(resolveUndoRouterOwner(document.querySelector('#editor'))).toBe('content');
});

it('preserves the previous owner when an overlay receives focus', () => {
  document.body.innerHTML = `
    <section data-undo-history-owner="content">
      <div role="dialog"><input id="palette" /></div>
    </section>
  `;
  setUndoRouterOwner('content');

  expect(resolveUndoRouterOwner(document.querySelector('#palette'))).toBeNull();
  expect(getUndoRouterOwner()).toBe('content');
});
