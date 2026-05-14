import { expect, it } from 'vitest';

import { scrollActiveTreeItemIntoView } from './nodeListAutoScroll';

function defineNumberProperty(target: object, key: string, value: number) {
  Object.defineProperty(target, key, { configurable: true, value });
}

function markTreeItem(treeItem: HTMLElement, nodeId: string) {
  treeItem.id = `node-treeitem-${nodeId}`;
  treeItem.dataset.nodeId = nodeId;
  treeItem.setAttribute('role', 'treeitem');
}

it('keeps the active tree item in the upper viewport area when possible', () => {
  const container = document.createElement('div');
  const treeItem = document.createElement('button');
  markTreeItem(treeItem, 'node-1');
  defineNumberProperty(container, 'clientHeight', 400);
  defineNumberProperty(container, 'scrollHeight', 2000);
  defineNumberProperty(treeItem, 'offsetTop', 1000);
  container.appendChild(treeItem);
  document.body.appendChild(container);

  scrollActiveTreeItemIntoView(container, 'node-1');

  expect(container.scrollTop).toBe(848);
});

it('does not scroll when the active tree item is already visible', () => {
  const container = document.createElement('div');
  const treeItem = document.createElement('button');
  markTreeItem(treeItem, 'node-1');
  defineNumberProperty(container, 'clientHeight', 400);
  defineNumberProperty(container, 'scrollHeight', 2000);
  defineNumberProperty(treeItem, 'offsetTop', 620);
  defineNumberProperty(treeItem, 'offsetHeight', 28);
  container.scrollTop = 500;
  container.appendChild(treeItem);
  document.body.appendChild(container);

  scrollActiveTreeItemIntoView(container, 'node-1');

  expect(container.scrollTop).toBe(500);
});

it('does not scroll when the target item is outside the container', () => {
  const container = document.createElement('div');
  const otherContainer = document.createElement('div');
  const treeItem = document.createElement('button');
  markTreeItem(treeItem, 'node-2');
  otherContainer.appendChild(treeItem);
  document.body.appendChild(container);
  document.body.appendChild(otherContainer);

  scrollActiveTreeItemIntoView(container, 'node-2');

  expect(container.scrollTop).toBe(0);
});

it('prefers the matching tree item inside the active scroll container', () => {
  const container = document.createElement('div');
  const otherContainer = document.createElement('div');
  const outsideItem = document.createElement('button');
  const insideItem = document.createElement('button');
  markTreeItem(outsideItem, 'node-1');
  markTreeItem(insideItem, 'node-1');
  defineNumberProperty(container, 'clientHeight', 400);
  defineNumberProperty(container, 'scrollHeight', 2000);
  defineNumberProperty(outsideItem, 'offsetTop', 100);
  defineNumberProperty(insideItem, 'offsetTop', 1000);
  otherContainer.appendChild(outsideItem);
  container.appendChild(insideItem);
  document.body.appendChild(otherContainer);
  document.body.appendChild(container);

  scrollActiveTreeItemIntoView(container, 'node-1');

  expect(container.scrollTop).toBe(848);
});

it('uses rect-relative position for transformed virtual rows', () => {
  const container = document.createElement('div');
  const treeItem = document.createElement('button');
  markTreeItem(treeItem, 'node-1');
  defineNumberProperty(container, 'clientHeight', 400);
  defineNumberProperty(container, 'scrollHeight', 2000);
  defineNumberProperty(treeItem, 'offsetTop', 0);
  defineNumberProperty(treeItem, 'offsetHeight', 28);
  container.scrollTop = 500;
  container.getBoundingClientRect = () => ({
    bottom: 400,
    height: 400,
    left: 0,
    right: 300,
    top: 0,
    width: 300,
    x: 0,
    y: 0,
    toJSON: () => undefined
  });
  treeItem.getBoundingClientRect = () => ({
    bottom: 128,
    height: 28,
    left: 0,
    right: 300,
    top: 100,
    width: 300,
    x: 0,
    y: 100,
    toJSON: () => undefined
  });
  container.appendChild(treeItem);
  document.body.appendChild(container);

  scrollActiveTreeItemIntoView(container, 'node-1');

  expect(container.scrollTop).toBe(500);
});
