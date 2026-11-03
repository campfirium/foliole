import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createContentSaveMock } from './companionContentEditingTestSupport';
import { ImmersiveReadableArticle } from './CompanionReadableArticleSurface';
import { CompanionReadingSystemBarNotice } from './CompanionReadingSystemBarNotice';

const foreground = vi.hoisted(() => new Set<() => void>());
const host = vi.hoisted(() => ({ platform: 'android', apply: vi.fn(async (value: unknown) => { void value; }) }));
vi.mock('../shared/platform/appLifecycle', () => ({ subscribeNativeAppForeground: async (callback: () => void) => {
  foreground.add(callback); return () => { foreground.delete(callback); };
} }));
vi.mock('@capacitor/core', async original => {
  const actual = await original<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => host.platform },
    registerPlugin: (name: string) => {
      const plugin = actual.registerPlugin(name);
      return name === 'FolioleCompanionBootstrap' ? new Proxy(plugin, { get(target, key) {
        return key === 'setReadingSystemBars' ? host.apply : Reflect.get(target, key);
      } }) : plugin;
    } };
});
vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: () => <p>Reading body</p> }));
const key = 'foliole-companion-reading-display';
const target = (enabled: boolean, hidden = false) => ({ enabled, hidden });
function article(nodeId = 'first', editing = false) {
  return <ImmersiveReadableArticle key={nodeId} onExit={() => undefined} snapshot={null}
    {...(editing ? { onSaveArticleContent: createContentSaveMock({ content: 'Reading body', versionId: 'initial' }) } : {})}
    readableArticle={{ content: 'Reading body', hideTitleHeading: false, nodeId, persistedNodeViewState: null,
      pdfAttachmentId: null, textAnchorDecorations: [], title: nodeId }} />;
}
function more() {
  fireEvent.click(screen.getByText('Reading body'));
  fireEvent.click(screen.getByRole('button', { name: 'More reading actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Appearance', exact: true }));
}
const applied = async (enabled: boolean, hidden = false) => {
  await waitFor(() => expect(host.apply).toHaveBeenLastCalledWith(target(enabled, hidden)));
};
afterEach(async () => { host.platform = 'android'; localStorage.clear(); await act(async () => undefined); vi.clearAllMocks(); });

it('shows time and battery with reading tools and hides them together without disabling overlay mode', async () => {
  localStorage.setItem(key, JSON.stringify({ hideSystemStatusBar: true }));
  const view = render(article());
  await applied(true, true);
  host.apply.mockClear();
  fireEvent.click(screen.getByText('Reading body'));
  await applied(true);
  fireEvent.click(screen.getByText('Reading body'));
  await applied(true, true);
  expect(host.apply.mock.calls.every(([value]) => (value as { enabled: boolean }).enabled)).toBe(true);
  view.rerender(<p>Library</p>);
  await applied(false);
});

it('keeps both preferences independent across articles, reentry and leaving reading', async () => {
  const view = render(article()); more();
  const system = screen.getByRole('switch', { name: 'Hide system status bar' });
  const overlay = screen.getByRole('switch', { name: 'Floating reading toolbars' });
  expect(system).not.toBeChecked(); expect(overlay).not.toBeChecked();
  fireEvent.click(system); await applied(true);
  expect(overlay).not.toBeChecked();
  fireEvent.click(overlay); expect(system).toBeChecked();
  fireEvent.click(system); await applied(false); expect(overlay).toBeChecked();
  fireEvent.click(system); await applied(true);
  view.rerender(article('second')); await applied(true, true); more();
  expect(screen.getByRole('switch', { name: 'Hide system status bar' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'Floating reading toolbars' })).toBeChecked();
  view.rerender(<p>Library</p>); await applied(false);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ hideSystemStatusBar: true, overlayToolbars: true });
});

it('restores normal window layout while editing and reapplies the current chrome state on foreground and rotation', async () => {
  localStorage.setItem(key, JSON.stringify({ hideSystemStatusBar: true }));
  render(article('first', true)); await applied(true, true); more();
  fireEvent.click(screen.getByRole('button', { name: 'Done', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit content', exact: true })); await applied(false);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true })); await applied(true);
  host.apply.mockClear();
  await act(async () => { foreground.forEach(callback => callback()); foreground.forEach(callback => callback()); });
  expect(host.apply).toHaveBeenCalledTimes(1);
  host.apply.mockClear(); await act(async () => { window.dispatchEvent(new Event('orientationchange')); });
  expect(host.apply).toHaveBeenCalledTimes(1);
});

it('keeps failed exit restoration visible in the surviving shell and retries its latest target', async () => {
  localStorage.setItem(key, JSON.stringify({ hideSystemStatusBar: true }));
  const view = render(<><CompanionReadingSystemBarNotice />{article()}</>); await applied(true, true);
  host.apply.mockRejectedValueOnce(new Error('window unavailable'));
  view.rerender(<><CompanionReadingSystemBarNotice /><p>Library</p></>);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not change the system status bar'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry system status bar' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument()); await applied(false);
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ hideSystemStatusBar: true });
});

it('preserves saved settings when storage is full, then retries', async () => {
  render(article()); more();
  fireEvent.click(screen.getByRole('switch', { name: 'Floating reading toolbars' }));
  fireEvent.click(screen.getByRole('switch', { name: 'Hide system status bar' })); await applied(true);
  const stored = localStorage.getItem(key);
  const used = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!)
    .reduce((total, item) => total + item.length + localStorage.getItem(item)!.length, 0);
  localStorage.setItem('quota', 'x'.repeat(5_000_000 - used - 5));
  fireEvent.click(screen.getByRole('switch', { name: 'Hide system status bar' }));
  expect(within(screen.getByRole('group', { name: 'Screen display' })).getByRole('alert')).toHaveTextContent('Could not save reading settings');
  expect(localStorage.getItem(key)).toBe(stored);
  localStorage.removeItem('quota'); fireEvent.click(screen.getByRole('switch', { name: 'Hide system status bar' }));
  await applied(false); expect(within(screen.getByRole('group', { name: 'Screen display' })).queryByRole('alert')).not.toBeInTheDocument();
});

it('finishes a delayed hide with normal window restoration after the reader unmounts', async () => {
  let release!: () => void;
  host.apply.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  localStorage.setItem(key, JSON.stringify({ hideSystemStatusBar: true }));
  const view = render(article()); await waitFor(() => expect(host.apply).toHaveBeenCalled());
  view.rerender(<p>Library</p>); expect(host.apply).toHaveBeenCalledTimes(1);
  await act(async () => { release(); }); await applied(false);
});

it.each(['ios', 'web'])('does not expose Android system bar control on %s', async platform => {
  host.platform = platform; render(article()); more();
  expect(screen.queryByRole('switch', { name: 'Hide system status bar' })).not.toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Floating reading toolbars' })).toBeInTheDocument();
  await act(async () => undefined); expect(host.apply).not.toHaveBeenCalled();
});
