import { afterEach, expect, it } from 'vitest';

import {
  getUndoRouterOwner,
  getUndoRouterContentContext,
  getUndoRouterContentDocumentId,
  registerUndoRouterContentContext,
  resolveUndoRouterOwner,
  setUndoRouterOwner,
  setUndoRouterTarget
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

it('tracks the focused content document independently from the owner', () => {
  setUndoRouterTarget('content', 'node-1::answer');

  expect(getUndoRouterOwner()).toBe('content');
  expect(getUndoRouterContentDocumentId()).toBe('node-1::answer');

  setUndoRouterTarget('content', null);
  expect(getUndoRouterContentDocumentId()).toBeNull();
});

it('resolves registered answer contexts without falling back to the body context', () => {
  const bodyContext = { applyText: () => true, currentContent: 'Body', nodeId: 'node-1' };
  const answerContext = { applyText: () => true, currentContent: 'Answer', nodeId: 'node-1::answer' };
  const unregister = registerUndoRouterContentContext('node-1::answer', answerContext);
  setUndoRouterTarget('content', 'node-1::answer');

  expect(getUndoRouterContentContext(bodyContext)).toBe(answerContext);
  unregister();
  expect(getUndoRouterContentContext(bodyContext)).toBeUndefined();
});
