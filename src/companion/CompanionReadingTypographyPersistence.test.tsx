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
  expect(screen.getByText('16px')).toBeInTheDocument();
  expect(screen.getByText('1.6')).toBeInTheDocument();
  for (const name of ['Increase Size', 'Increase Line height', 'Serif', 'High']) choose(name);
  expect(loadReadingTypographySettings()).toEqual({
    fontWeight: 400, fontSize: 17, fontFamily: 'serif', lineHeight: 1.7, contrast: 'high', paragraphSpacing: 0.35, textWidth: 100
  });
  const document = view.container.querySelector('[data-reading-font-size]') as HTMLElement;
  expect(document.style.getPropertyValue('--companion-reading-base-font-size')).toBe('17px');
  expect(document.style.getPropertyValue('--content-panel-line-height')).toBe('1.7');
  view.unmount();
  mountArticle();
  openAppearance();
  expect(screen.getByText('17px')).toBeInTheDocument();
  expect(screen.getByText('1.7')).toBeInTheDocument();
  for (const name of ['Serif', 'High']) {
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
  }
  choose('Decrease Size');
  choose('Decrease Line height');
  expect(loadReadingTypographySettings()).toMatchObject({ fontSize: 16, lineHeight: 1.6 });
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
  choose('Serif');
  expect(screen.getByText('16px')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading settings. Your previous settings are still in use.');
  expect(loadReadingTypographySettings()).toEqual(confirmed);
  view.unmount();
  mountArticle();
  openAppearance();
  expect(screen.getByText('16px')).toBeInTheDocument();
  choose('Serif');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  storage.removeItem('quota');
  choose('Serif');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(loadReadingTypographySettings().fontFamily).toBe('serif');
  await act(async () => undefined);
});


it('aligns an existing fractional line height to tenths when adjusted', async () => {
  window.localStorage.setItem('foliole-companion-reading-typography-settings',
    JSON.stringify({ fontSize: 19, lineHeight: 1.67, fontFamily: 'sans', contrast: 'default' }));
  mountArticle();
  openAppearance();
  choose('Increase Line height');
  expect(screen.getByText('1.7')).toBeInTheDocument();
  expect(loadReadingTypographySettings().lineHeight).toBe(1.7);
  choose('Decrease Line height');
  expect(screen.getByText('1.6')).toBeInTheDocument();
  expect(loadReadingTypographySettings().lineHeight).toBe(1.6);
  await act(async () => undefined);
});


it('adjusts paragraph spacing in the current reader and retains it on reentry', async () => {
  const view = mountArticle();
  const document = view.container.querySelector('[data-reading-font-size]') as HTMLElement;
  expect(document.style.getPropertyValue('--content-panel-paragraph-spacing')).toBe('0.35em');
  openAppearance();
  choose('Increase Paragraph spacing');
  expect(document.style.getPropertyValue('--content-panel-paragraph-spacing')).toBe('0.4em');
  expect(loadReadingTypographySettings()).toMatchObject({ paragraphSpacing: 0.4 });
  choose('Decrease Paragraph spacing');
  expect(document.style.getPropertyValue('--content-panel-paragraph-spacing')).toBe('0.35em');
  choose('Increase Paragraph spacing');
  view.unmount();
  const returned = mountArticle();
  openAppearance();
  expect(screen.getByLabelText('Paragraph spacing')).toHaveTextContent('0.4em');
  expect(returned.container.querySelector('[data-reading-font-size]'))
    .toHaveStyle({ '--content-panel-paragraph-spacing': '0.4em' });
  await act(async () => undefined);
});

it('keeps paragraph spacing and its persisted value on failure, then retries', async () => {
  const view = mountArticle();
  openAppearance();
  choose('Increase Paragraph spacing');
  const confirmed = loadReadingTypographySettings();
  const storage = window.localStorage;
  let used = 0;
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)!;
    used += key.length + storage.getItem(key)!.length;
  }
  storage.setItem('quota', 'x'.repeat(5_000_000 - used - 'quota'.length));
  choose('Increase Paragraph spacing');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(loadReadingTypographySettings()).toEqual(confirmed);
  expect(view.container.querySelector('[data-reading-font-size]'))
    .toHaveStyle({ '--content-panel-paragraph-spacing': '0.4em' });
  storage.removeItem('quota');
  choose('Increase Paragraph spacing');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(loadReadingTypographySettings()).toMatchObject({ paragraphSpacing: 0.45 });
  await act(async () => undefined);
});


it('changes text width in the same reader, retains it after reentry, and recovers from save failure', async () => {
  const view = mountArticle();
  const body = view.container.querySelector('[data-reading-font-size]');
  expect(body).toHaveStyle({ '--document-max-width': '100%' });
  openAppearance();
  expect(screen.getByRole('button', { name: 'Increase Text width' })).toBeDisabled();
  choose('Decrease Text width');
  expect(body).toHaveStyle({ '--document-max-width': '99%' });
  expect(loadReadingTypographySettings().textWidth).toBe(99);
  const storage = window.localStorage;
  let used = 0;
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)!;
    used += key.length + storage.getItem(key)!.length;
  }
  storage.setItem('quota', 'x'.repeat(5_000_000 - used - 'quota'.length));
  choose('Increase Text width');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(body).toHaveStyle({ '--document-max-width': '99%' });
  expect(loadReadingTypographySettings().textWidth).toBe(99);
  storage.removeItem('quota');
  choose('Decrease Text width');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(body).toHaveStyle({ '--document-max-width': '98%' });
  view.unmount();
  const returned = mountArticle();
  openAppearance();
  expect(screen.getByLabelText('Text width')).toHaveTextContent('98%');
  expect(returned.container.querySelector('[data-reading-font-size]')).toHaveStyle({ '--document-max-width': '98%' });
  await act(async () => undefined);
});
