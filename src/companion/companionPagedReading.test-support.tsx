import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { vi } from 'vitest';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

export function mountPagedArticle(options?: { wrapper: ComponentType<{ children: ReactNode }> }) {
  const exit = vi.fn();
  const view = render(<ImmersiveReadableArticle onExit={exit} onSaveArticleContent={createContentSaveMock()} snapshot={null}
    readableArticle={{ content: 'Reading body', hideTitleHeading: false, nodeId: 'paged-topic',
      persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [], title: 'Paged topic' }} />, options);
  const surface = view.container.querySelector('section')!;
  Object.defineProperties(surface, { clientHeight: { configurable: true, value: 812 }, scrollHeight: { configurable: true, value: 4000 } });
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 375, height: 812, right: 375, bottom: 812, x: 0, y: 0, toJSON() {} });
  surface.style.paddingTop = '56px';
  surface.style.paddingBottom = '80px';
  return { ...view, surface, exit, body: screen.getByText('Reading body') };
}

export function openReadingMode() {
  if (!screen.queryByRole('button', { name: 'More reading actions' })) fireEvent.click(screen.getByText('Reading body'));
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
}

export function chooseMode(name: 'Paged scroll' | 'Continuous scroll') {
  openReadingMode();
  fireEvent.click(screen.getByRole('button', { name }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
}

export function pointer(target: HTMLElement, type: string, x: number, y = 300, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'touch' }, isPrimary: { value: id === 1 } });
  fireEvent(target, event);
}

export function tap(target: HTMLElement, x: number) {
  pointer(target, 'pointerdown', x);
  pointer(target, 'pointerup', x);
  fireEvent.click(target, { detail: 1, clientX: x, clientY: 300 });
}
