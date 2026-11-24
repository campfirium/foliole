import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';

import { AppBreadcrumb } from './Breadcrumb';

it('keeps the ancestor levels on one line and selects a level by id', () => {
  const onSelect = vi.fn();
  renderWithLocalization(
    <AppBreadcrumb
      items={[
        { id: 'guide', label: 'Guides', title: 'Guides' },
        { id: 'welcome', label: 'Welcome to…', title: 'Welcome to Foliole' }
      ]}
      onSelect={onSelect}
    />
  );

  expect(screen.getByRole('navigation')).toHaveClass('whitespace-nowrap', 'overflow-hidden');
  expect(screen.queryByRole('button', { name: 'Expand breadcrumb path' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Welcome to…' }));
  expect(onSelect).toHaveBeenCalledWith('welcome');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockBreadcrumbLayout(initialWidth: number) {
  let width = initialWidth;
  let onResize: ResizeObserverCallback | undefined;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { onResize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.querySelectorAll(':scope > button').length * 32;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return DOMRect.fromRect({ width: this.tagName === 'BUTTON' || this.querySelector('button') ? 32 : 0 });
  });
  return (nextWidth: number) => {
    width = nextWidth;
    act(() => onResize?.([{ contentRect: DOMRect.fromRect({ width }) } as ResizeObserverEntry], {} as ResizeObserver));
  };
}

const deepPath = Array.from({ length: 80 }, (_, index) => ({ id: String(index + 1), label: `Folder ${index + 1}` }));

function expectCollapsedPath() {
  expect(screen.getByRole('button', { name: 'Expand breadcrumb path' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Folder 80' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Folder 79' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Folder 78' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Folder 1' })).not.toBeInTheDocument();
}

it('fits an 80-level path on first opening a narrow reading pane', () => {
  mockBreadcrumbLayout(100);
  const select = vi.fn();
  renderWithLocalization(<AppBreadcrumb items={deepPath} onSelect={select} />);

  expectCollapsedPath();
  fireEvent.click(screen.getByRole('button', { name: 'Folder 80' }));
  expect(select).toHaveBeenCalledWith('80');
});

it('fits the same deep path when the pane shrinks and restores it when the pane grows', () => {
  const resize = mockBreadcrumbLayout(3_000);
  renderWithLocalization(<AppBreadcrumb items={deepPath} onSelect={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Folder 1' })).toBeInTheDocument();

  resize(100);
  expectCollapsedPath();

  resize(3_000);
  expect(screen.getByRole('button', { name: 'Folder 1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Expand breadcrumb path' })).not.toBeInTheDocument();
});
