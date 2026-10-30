import { act, fireEvent, render, screen } from '@testing-library/react';
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
  fireEvent.click(screen.getByRole('button', { name }));
}

afterEach(() => window.localStorage.clear());

it('finely adjusts the rendered text and restores exact values after remounting', async () => {
  const view = mountArticle();
  openAppearance();
  expect(screen.getByText('17px')).toBeInTheDocument();
  expect(screen.getByText('1.62')).toBeInTheDocument();
  for (const name of ['Increase Size', 'Increase Line height', 'Serif', 'High']) choose(name);
  expect(loadReadingTypographySettings()).toEqual({
    fontSize: 18, fontFamily: 'serif', lineHeight: 1.67, contrast: 'high'
  });
  const document = view.container.querySelector('[data-reading-font-size]') as HTMLElement;
  expect(document.style.getPropertyValue('--content-panel-font-size')).toBe('18px');
  expect(document.style.getPropertyValue('--content-panel-line-height')).toBe('1.67');
  view.unmount();
  mountArticle();
  openAppearance();
  expect(screen.getByText('18px')).toBeInTheDocument();
  expect(screen.getByText('1.67')).toBeInTheDocument();
  for (const name of ['Serif', 'High']) {
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
  }
  choose('Decrease Size');
  choose('Decrease Line height');
  expect(loadReadingTypographySettings()).toMatchObject({ fontSize: 17, lineHeight: 1.62 });
  await act(async () => undefined);
});

it('retains confirmed settings on quota failure and allows retry', async () => {
  window.localStorage.setItem('foliole-companion-reading-typography-settings',
    JSON.stringify({ fontSize: 17, lineHeight: 1.3, fontFamily: 'sans', contrast: 'default' }));
  const view = mountArticle();
  openAppearance();
  choose('Decrease Size');
  const confirmed = loadReadingTypographySettings();
  const storage = window.localStorage;
  let used = 0;
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)!;
    used += key.length + storage.getItem(key)!.length;
  }
  storage.setItem('quota', 'x'.repeat(5_000_000 - used - 'quota'.length));
  choose('Increase Line height');
  expect(screen.getByText('16px')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading settings. Your previous settings are still in use.');
  expect(loadReadingTypographySettings()).toEqual(confirmed);
  view.unmount();
  mountArticle();
  openAppearance();
  expect(screen.getByText('16px')).toBeInTheDocument();
  choose('Increase Line height');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  storage.removeItem('quota');
  choose('Increase Line height');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(loadReadingTypographySettings().lineHeight).toBe(1.35);
  await act(async () => undefined);
});
