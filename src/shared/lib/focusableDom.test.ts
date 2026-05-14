import { describe, expect, it } from 'vitest';

import { getFocusableElements, isFocusableElement } from './focusableDom';

function createContainer(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  return container;
}

describe('focusable DOM helpers', () => {
  it('includes native, role-based, and editable focus targets', () => {
    const container = createContainer(`
      <button data-id="button">Button</button>
      <div data-id="role-button" role="button" tabindex="0">Role button</div>
      <div data-id="treeitem" role="treeitem" tabindex="0">Tree item</div>
      <div data-id="menuitem" role="menuitem" tabindex="0">Menu item</div>
      <div data-id="option" role="option" tabindex="0">Option</div>
      <div data-id="editable" contenteditable="plaintext-only">Editable</div>
    `);

    expect(getFocusableElements(container).map((element) => element.dataset.id)).toEqual([
      'button',
      'role-button',
      'treeitem',
      'menuitem',
      'option',
      'editable'
    ]);
  });

  it('does not force role-only nodes into the tab cycle', () => {
    const element = createContainer('<div role="button">Role only</div>').firstElementChild;

    expect(element).toBeInstanceOf(HTMLElement);
    expect(isFocusableElement(element as HTMLElement)).toBe(false);
  });

  it('excludes disabled and intentionally untabbable targets', () => {
    const container = createContainer(`
      <button data-id="disabled" disabled>Disabled</button>
      <div data-id="aria-disabled" role="button" tabindex="0" aria-disabled="true">Disabled</div>
      <div data-id="untabbable" role="button" tabindex="-1">Untabbable</div>
      <button data-id="enabled">Enabled</button>
    `);

    expect(getFocusableElements(container).map((element) => element.dataset.id)).toEqual(['enabled']);
  });

  it('excludes hidden and invisible subtrees', () => {
    const container = createContainer(`
      <section hidden><button data-id="hidden">Hidden</button></section>
      <section aria-hidden="true"><button data-id="aria-hidden">Aria hidden</button></section>
      <section inert><button data-id="inert">Inert</button></section>
      <section style="display: none;"><button data-id="display-none">Display none</button></section>
      <button data-id="visible">Visible</button>
    `);

    expect(getFocusableElements(container).map((element) => element.dataset.id)).toEqual(['visible']);
  });
});
