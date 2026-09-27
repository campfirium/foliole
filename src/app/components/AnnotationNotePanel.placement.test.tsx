import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { AnnotationNotePanel } from './AnnotationNotePanel';

const storageKey = APP_SETTINGS_STORAGE_KEYS.annotationPanelPlacement;
const callbacks = { onCancel: vi.fn(), onChange: vi.fn(), onSave: vi.fn() };

function openPanel(left: number, top: number) {
  const result = renderWithLocalization(
    <AnnotationNotePanel draft="" left={left} top={top} {...callbacks} />
  );
  const panel = result.container.querySelector('[data-annotation-toolbar="true"]') as HTMLElement;
  const dragHandle = panel.querySelector('.cursor-move') as HTMLElement;
  return { ...result, panel, dragHandle };
}

function drag(handle: HTMLElement, dx: number, dy: number) {
  dispatchPointer(handle, 'pointerdown', 0, 0);
  dispatchPointer(window, 'pointermove', dx, dy);
  dispatchPointer(window, 'pointerup', dx, dy);
}

function dispatchPointer(target: Element | Window, type: string, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 }, clientX: { value: clientX }, clientY: { value: clientY }, pointerId: { value: 1 }
  });
  fireEvent(target, event);
}

beforeEach(() => {
  window.localStorage.removeItem(storageKey);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
});

afterEach(() => {
  window.localStorage.removeItem(storageKey);
});

it('remembers horizontal placement after a drag while following the next annotation vertically', () => {
  const first = openPanel(100, 100);
  expect(first.panel.style.left).toBe('100px');
  expect(screen.queryByRole('button', { name: 'Follow selection' })).toBeNull();

  drag(first.dragHandle, 250, 120);
  expect(first.panel.style.left).toBe('350px');
  expect(first.panel.style.top).toBe('220px');
  expect(screen.getByRole('button', { name: 'Follow selection' })).toBeTruthy();
  first.unmount();

  const next = openPanel(30, 400);
  expect(next.panel.style.left).toBe('350px');
  expect(next.panel.style.top).toBe('400px');
  fireEvent.click(screen.getByRole('button', { name: 'Follow selection' }));
  expect(next.panel.style.left).toBe('30px');
  expect(next.panel.style.top).toBe('400px');
  expect(screen.queryByRole('button', { name: 'Follow selection' })).toBeNull();
});

it('keeps the resized panel visible when the window shrinks and preserves its size preference', () => {
  const first = openPanel(700, 300);
  drag(first.dragHandle, 50, 0);
  drag(screen.getByRole('separator', { name: 'Resize annotation editor' }), 100, 80);
  expect(first.panel.style.width).toBe('378px');
  expect(first.panel.style.height).toBe('258px');

  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
  fireEvent.resize(window);
  expect(first.panel.style.left).toBe('114px');
  first.unmount();

  const next = openPanel(20, 100);
  expect(next.panel.style.left).toBe('114px');
  expect(next.panel.style.width).toBe('378px');
  expect(next.panel.style.height).toBe('258px');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
  fireEvent.resize(window);
  expect(next.panel.style.left).toBe('714px');
});
