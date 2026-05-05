import { expect, it } from 'vitest';

import { scrollActiveTreeItemIntoView } from './nodeListAutoScroll';

function defineNumberProperty(target: object, key: string, value: number) {
  Object.defineProperty(target, key, { configurable: true, value });
}

it('keeps the active tree item in the upper viewport area when possible', () => {
  const container = document.createElement('div');
  const treeItem = document.createElement('button');
  treeItem.id = 'node-treeitem-node-1';
  defineNumberProperty(container, 'clientHeight', 400);
  defineNumberProperty(container, 'scrollHeight', 2000);
  defineNumberProperty(treeItem, 'offsetTop', 1000);
  container.appendChild(treeItem);
  document.body.appendChild(container);

  scrollActiveTreeItemIntoView(container, 'node-1');

  expect(container.scrollTop).toBe(900);
});

it('does not scroll when the target item is outside the container', () => {
  const container = document.createElement('div');
  const otherContainer = document.createElement('div');
  const treeItem = document.createElement('button');
  treeItem.id = 'node-treeitem-node-2';
  otherContainer.appendChild(treeItem);
  document.body.appendChild(container);
  document.body.appendChild(otherContainer);

  scrollActiveTreeItemIntoView(container, 'node-2');

  expect(container.scrollTop).toBe(0);
});
