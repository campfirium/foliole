import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { CompanionReadingSystemBarNotice } from './CompanionReadingSystemBarNotice';

const foreground = vi.hoisted(() => new Set<() => void>());
vi.mock('../shared/platform/appLifecycle', () => ({ subscribeNativeAppForeground: async (callback: () => void) => {
  foreground.add(callback); return () => { foreground.delete(callback); };
} }));
const host = vi.hoisted(() => ({ platform: 'android', hide: vi.fn(async () => {}), show: vi.fn(async () => {}) }));
vi.mock('@capacitor/core', async original => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => host.platform },
    SystemBars: { hide: host.hide, show: host.show } };
});
vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: () => <p>Reading body</p> }));
function article(nodeId = 'first') {
  return <ImmersiveReadableArticle key={nodeId} onExit={() => undefined} snapshot={null} readableArticle={{
    content: 'Reading body', hideTitleHeading: false, nodeId, persistedNodeViewState: null,
    pdfAttachmentId: null, textAnchorDecorations: [], title: nodeId
  }} />;
}
function more() {
  fireEvent.click(screen.getByText('Reading body'));
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
}
afterEach(async () => { host.platform = 'android'; localStorage.clear(); await act(async () => undefined); vi.clearAllMocks(); });

it('keeps the two Android reading preferences independent across articles and leaving reading', async () => {
  const view = render(article());
  more();
  const system = screen.getByRole('switch', { name: 'Hide system status bar' });
  const overlay = screen.getByRole('switch', { name: 'Overlay toolbars' });
  expect(system).not.toBeChecked(); expect(overlay).not.toBeChecked();
  fireEvent.click(system);
  await waitFor(() => expect(host.hide).toHaveBeenCalledWith({ bar: 'StatusBar' }));
  expect(overlay).not.toBeChecked();
  fireEvent.click(overlay);
  expect(system).toBeChecked(); expect(overlay).toBeChecked();
  fireEvent.click(system);
  await waitFor(() => expect(host.show).toHaveBeenCalledWith({ bar: 'StatusBar' }));
  expect(overlay).toBeChecked();
  fireEvent.click(system);
  view.rerender(article('second'));
  more();
  expect(screen.getByRole('switch', { name: 'Hide system status bar' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'Overlay toolbars' })).toBeChecked();
  host.show.mockClear();
  view.rerender(<p>Library</p>);
  await waitFor(() => expect(host.show).toHaveBeenCalledWith({ bar: 'StatusBar' }));
  expect(JSON.parse(localStorage.getItem('foliole-companion-reading-display')!)).toEqual({
    hideSystemStatusBar: true, overlayToolbars: true
  });
});


it('restores the bar during editing and reapplies the saved choice after foreground and rotation', async () => {
  localStorage.setItem('foliole-companion-reading-display', JSON.stringify({ hideSystemStatusBar: true }));
  const base = article();
  const view = render(<ImmersiveReadableArticle {...base.props} onSaveArticleContent={createContentSaveMock({ content: 'Reading body', versionId: 'initial' })} />);
  await waitFor(() => expect(host.hide).toHaveBeenCalled());
  more();
  fireEvent.click(screen.getByRole('button', { name: 'Done', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit content', exact: true }));
  await waitFor(() => expect(host.show).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  await act(async () => undefined);
  host.hide.mockClear();
  await act(async () => { foreground.forEach(callback => callback()); foreground.forEach(callback => callback()); });
  expect(host.hide).toHaveBeenCalledTimes(1);
  host.hide.mockClear();
  await act(async () => { window.dispatchEvent(new Event('orientationchange')); });
  expect(host.hide).toHaveBeenCalledTimes(1);
  view.unmount();
});

it('shows a failed exit restoration in the surviving shell and retries the latest target', async () => {
  localStorage.setItem('foliole-companion-reading-display', JSON.stringify({ hideSystemStatusBar: true }));
  const view = render(<><CompanionReadingSystemBarNotice />{article()}</>);
  await waitFor(() => expect(host.hide).toHaveBeenCalled());
  host.show.mockRejectedValueOnce(new Error('window unavailable'));
  view.rerender(<><CompanionReadingSystemBarNotice /><p>Library</p></>);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not change the system status bar'));
  expect(JSON.parse(localStorage.getItem('foliole-companion-reading-display')!)).toMatchObject({ hideSystemStatusBar: true });
  fireEvent.click(screen.getByRole('button', { name: 'Retry system status bar' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(host.show).toHaveBeenLastCalledWith({ bar: 'StatusBar' });
});

it('preserves both saved settings when changing the system preference runs out of storage', async () => {
  const view = render(article());
  more();
  fireEvent.click(screen.getByRole('switch', { name: 'Overlay toolbars' }));
  fireEvent.click(screen.getByRole('switch', { name: 'Hide system status bar' }));
  await waitFor(() => expect(host.hide).toHaveBeenCalled());
  const stored = localStorage.getItem('foliole-companion-reading-display');
  const used = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!)
    .reduce((total, key) => total + key.length + localStorage.getItem(key)!.length, 0);
  localStorage.setItem('quota', 'x'.repeat(5_000_000 - used - 5));
  fireEvent.click(screen.getByRole('switch', { name: 'Hide system status bar' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading settings');
  expect(localStorage.getItem('foliole-companion-reading-display')).toBe(stored);
  expect(screen.getByRole('switch', { name: 'Hide system status bar' })).toBeChecked();
  localStorage.removeItem('quota');
  fireEvent.click(screen.getByRole('switch', { name: 'Hide system status bar' }));
  await waitFor(() => expect(host.show).toHaveBeenCalled());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  view.unmount();
});


it('finishes a delayed hide with restoration when the actual reader unmounts', async () => {
  let release!: () => void;
  host.hide.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const view = render(article());
  more();
  fireEvent.click(screen.getByRole('switch', { name: 'Hide system status bar' }));
  await waitFor(() => expect(host.hide).toHaveBeenCalled());
  host.show.mockClear();
  view.rerender(<p>Library</p>);
  expect(host.show).not.toHaveBeenCalled();
  await act(async () => { release(); });
  await waitFor(() => expect(host.show).toHaveBeenCalledWith({ bar: 'StatusBar' }));
});


it('keeps a saved preference and exposes retry inside the reading menu when hiding fails', async () => {
  render(article());
  more();
  host.hide.mockRejectedValueOnce(new Error('window unavailable'));
  fireEvent.click(screen.getByRole('switch', { name: 'Hide system status bar' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not change the system status bar'));
  expect(screen.getByRole('switch', { name: 'Hide system status bar' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Retry system status bar' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

it.each(['ios', 'web'])('does not expose Android system bar control on %s', async platform => {
  host.platform = platform;
  render(article());
  more();
  expect(screen.queryByRole('switch', { name: 'Hide system status bar' })).not.toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Overlay toolbars' })).toBeInTheDocument();
  await act(async () => undefined);
  expect(host.hide).not.toHaveBeenCalled();
  expect(host.show).not.toHaveBeenCalled();
});
