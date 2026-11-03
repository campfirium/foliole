import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';

vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: () => <p>Reading body</p> }));
const key = 'foliole-companion-reading-display';
function article(flow = false, nodeId = 'display-topic') {
  return <ImmersiveReadableArticle flow={flow} onExit={() => undefined} snapshot={null} readableArticle={{
    content: 'Reading body', hideTitleHeading: false, nodeId, persistedNodeViewState: null,
    pdfAttachmentId: null, textAnchorDecorations: [], title: nodeId
  }} />;
}
function openMore() {
  fireEvent.click(screen.getByText('Reading body'));
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  expect(screen.queryByRole('switch', { name: 'Floating reading toolbars' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  expect(screen.getByRole('group', { name: 'Screen display' })).toBeInTheDocument();
}
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it.each([false, true])('retains the overlay choice across articles, Flow=%s and remount', async flow => {
  const view = render(article(flow));
  openMore();
  const toggle = screen.getByRole('switch', { name: 'Floating reading toolbars' });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  expect(toggle).toBeChecked();
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ overlayToolbars: true, hideSystemStatusBar: false });
  view.rerender(article(!flow, 'next-topic'));
  expect(screen.getByRole('switch', { name: 'Floating reading toolbars' })).toBeChecked();
  view.unmount();
  render(article(flow, 'returned-topic'));
  openMore();
  expect(screen.getByRole('switch', { name: 'Floating reading toolbars' })).toBeChecked();
  fireEvent.click(screen.getByRole('switch', { name: 'Floating reading toolbars' }));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ overlayToolbars: false });
  await act(async () => undefined);
});

it('keeps the saved choice when storage is full, then lets the reader retry', async () => {
  render(article());
  openMore();
  const used = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!)
    .reduce((total, item) => total + item.length + localStorage.getItem(item)!.length, 0);
  localStorage.setItem('quota', 'x'.repeat(5_000_000 - used - 5));
  fireEvent.click(screen.getByRole('switch', { name: 'Floating reading toolbars' }));
  expect(screen.getByRole('switch', { name: 'Floating reading toolbars' })).not.toBeChecked();
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading settings');
  expect(localStorage.getItem(key)).toBeNull();
  localStorage.removeItem('quota');
  fireEvent.click(screen.getByRole('switch', { name: 'Floating reading toolbars' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Floating reading toolbars' })).toBeChecked();
  await act(async () => undefined);
});
