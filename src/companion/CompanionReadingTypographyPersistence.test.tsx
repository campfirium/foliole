import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { loadReadingTypographySettings } from './companionReadingTypographySettings';

vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: () => <p>Reading body</p> }));

function mountArticle() {
  return render(<ImmersiveReadableArticle onExit={() => undefined} snapshot={null} readableArticle={{
    content: 'Reading body', hideTitleHeading: false, nodeId: 'reading-settings-topic',
    persistedNodeViewState: null, pdfAttachmentId: null, textAnchorDecorations: [], title: 'Reading settings'
  }} />);
}

function openAppearance() {
  fireEvent.click(screen.getByText('Reading body'));
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
}

function choose(name: string) {
  fireEvent.click(screen.getByRole('button', { name, exact: true }));
}

afterEach(() => window.localStorage.clear());

it('restores settings selected through the reading surface after leaving and remounting', () => {
  const view = mountArticle();
  openAppearance();
  for (const name of ['Extra large', 'Serif', 'Relaxed', 'High']) choose(name);
  expect(loadReadingTypographySettings()).toEqual({
    fontSize: 'xlarge', fontFamily: 'serif', lineHeight: 'relaxed', contrast: 'high'
  });
  view.unmount();
  const reopened = mountArticle();
  openAppearance();
  for (const name of ['Extra large', 'Serif', 'Relaxed', 'High']) {
    expect(screen.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  expect(reopened.container.querySelector('[data-reading-font-size]')).toHaveAttribute('data-reading-font-size', 'xlarge');
});

it('retains confirmed settings and reports quota failure, then allows retry', () => {
  const view = mountArticle();
  openAppearance();
  choose('Small');
  const confirmed = loadReadingTypographySettings();
  const storage = window.localStorage;
  let used = 0;
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)!;
    used += key.length + storage.getItem(key)!.length;
  }
  storage.setItem('quota', 'x'.repeat(5_000_000 - used - 'quota'.length));
  choose('Extra large');
  expect(screen.getByRole('button', { name: 'Small', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading settings. Your previous settings are still in use.');
  expect(loadReadingTypographySettings()).toEqual(confirmed);
  expect(view.container.querySelector('[data-reading-font-size]')).toHaveAttribute('data-reading-font-size', 'small');
  view.unmount();
  mountArticle();
  openAppearance();
  expect(screen.getByRole('button', { name: 'Small', exact: true })).toHaveAttribute('aria-pressed', 'true');
  choose('Extra large');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  storage.removeItem('quota');
  choose('Extra large');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(loadReadingTypographySettings().fontSize).toBe('xlarge');
});
