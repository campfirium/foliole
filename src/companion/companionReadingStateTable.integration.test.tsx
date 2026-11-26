// T886: one table of "starting scene x event -> body boundary, system bar requests, toolbars, tap result",
// run on the real reading components under the Android and iOS runtime capabilities.
import { readFileSync } from 'node:fs';

import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BODY, createBodyBoundaryReader } from './companionReadingStateTable.geometry.testSupport';
import { host } from './companionReadingStateTable.host.testSupport';
import { sessionRows, type ReadingStateRow } from './companionReadingStateTable.rows.testSupport';
import { article, mount, shell } from './companionReadingStateTable.scenes.testSupport';
import { tapRows } from './companionReadingStateTable.tapRows.testSupport';
import { createProbe, installLayout, removeLayout, type Observation, type Platform } from './companionReadingStateTable.testSupport';
import { windowRows } from './companionReadingStateTable.windowRows.testSupport';
import { updateCompanionToolbarAppearance } from './companionSelectionToolbarPreference';

const readBodyBoundary = createBodyBoundaryReader(readFileSync(
  'src/companion/companionReadingDisplay.css', 'utf8'
));

vi.mock('@capacitor/core', async original => {
  const actual = await original<typeof import('@capacitor/core')>();
  const { host: state } = await import('./companionReadingStateTable.host.testSupport');
  return { ...actual,
    Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => state.platform, isPluginAvailable: () => false },
    registerPlugin: () => new Proxy({}, { get: (_, key) => key === 'then' ? undefined
      : key === 'setReadingSystemBars' ? state.apply : async () => ({}) }) };
});
vi.mock('../shared/platform/appLifecycle', async () => {
  const { host: state } = await import('./companionReadingStateTable.host.testSupport');
  return { subscribeNativeAppForeground: async (callback: () => void) => {
    state.foreground.add(callback);
    return () => { state.foreground.delete(callback); };
  } };
});
vi.mock('./useCompanionExternalDirectory', async () => {
  const { host: state } = await import('./companionReadingStateTable.host.testSupport');
  return { useCompanionExternalDocument: () => state.externalDocument,
    useCompanionExternalDirectory: () => ({ entries: [], folders: [] }) };
});
vi.mock('@/features/editor/components/MarkdownEditor', async () => {
  const { useEffect } = await import('react');
  const { host: state } = await import('./companionReadingStateTable.host.testSupport');
  // The editor needs text layout; this stand-in keeps its DOM contract and the adapter calls the reader makes.
  return { MarkdownEditor: (props: { value: string; onReady?: (adapter: unknown) => void }) => {
    const { onReady, value } = props;
    useEffect(() => {
      let selection = { from: 0, to: 0 };
      onReady?.({
        focus: () => undefined, getContent: () => value, getSelection: () => selection,
        getSelectionRanges: () => [selection], setSelection: (next: typeof selection) => { selection = next; },
        setReadingSelection: (range: unknown) => { state.managed = range; },
        getDocumentPositionAtClientPoint: () => 2, getPositionClientRect: () => null,
        getScrollTop: () => 0, setScrollTop: () => undefined, onScroll: () => () => undefined,
        getDocumentPositionAtViewportY: () => null
      });
      return () => onReady?.(null);
    }, [onReady, value]);
    return <div className="cm-content">
      <p>{value}</p>
      <mark className="cm-md-highlight">Existing highlight</mark>
    </div>;
  } };
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  installLayout();
});

afterEach(async () => {
  cleanup();
  // Let the unmounted reader hand the system bars back before the next row.
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  vi.useRealTimers();
  vi.restoreAllMocks();
  removeLayout();
  window.getSelection()?.removeAllRanges();
  localStorage.clear();
  // The toolbar appearance is also held in memory.
  updateCompanionToolbarAppearance({ selectionToolbarEnabled: true });
  localStorage.clear();
  host.apply.mockClear();
  host.managed = null;
});

async function observeRow(row: ReadingStateRow, platform: Platform) {
  host.platform = platform;
  localStorage.setItem('foliole-companion-reading-display',
    JSON.stringify({ hideSystemStatusBar: true, ...row.display }));
  if (row.paged) localStorage.setItem('foliole-companion-reading-mode', 'paged');
  const probe = createProbe(readBodyBoundary);
  await row.run(probe, platform);
  probe.checkpoint();
  return probe.observe();
}

const edges = (boundary: string) => boundary.split('/').map(Number) as [number, number];

const onPlatform = (observation: Observation, platform: Platform): Observation =>
  platform === 'ios' ? { ...observation, bars: [] } : observation;

describe.each<Platform>(['android', 'ios'])('reading state table on %s', platform => {
  it.each(['article', 'flow'] as const)('floating %s reading reaches further than docked at both edges', async layout => {
    const observed: [number, number][] = [];
    for (const overlayToolbars of [false, true]) {
      host.platform = platform;
      localStorage.setItem('foliole-companion-reading-display', JSON.stringify({ overlayToolbars }));
      const probe = createProbe(readBodyBoundary);
      mount(layout === 'flow' ? shell({ nodeId: 'topic-2' }) : article());
      await probe.flush();
      const [boundary, ...moved] = probe.observe().body;
      expect(moved).toEqual([]);
      expect(boundary).toBe(overlayToolbars ? BODY.floating : BODY[layout]);
      observed.push(edges(boundary!));
      cleanup();
      await probe.flush();
    }
    const [docked, floating] = observed as [[number, number], [number, number]];
    expect(floating[0]).toBeLessThan(docked[0]);
    expect(floating[1]).toBeLessThan(docked[1]);
  });

  const rows = [...sessionRows, ...tapRows, ...windowRows].filter(row => row.platforms?.includes(platform) ?? true);
  for (const row of rows) {
    const name = `${row.scene} | ${row.event}`;
    it(name, async () => {
      expect(await observeRow(row, platform)).toEqual(onPlatform(row.expected, platform));
    });
  }
});
