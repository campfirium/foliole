// T886: one table of "starting scene x event -> body boundary, system bar requests, toolbars, tap result",
// run on the real reading components under the Android and iOS runtime capabilities.
import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { host } from './companionReadingStateTable.host.testSupport';
import { sessionRows, tapRows, type ReadingStateRow } from './companionReadingStateTable.rows.testSupport';
import { createProbe, installLayout, removeLayout, type Observation, type Platform } from './companionReadingStateTable.testSupport';
import { windowRows } from './companionReadingStateTable.windowRows.testSupport';

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
  host.apply.mockClear();
  host.managed = null;
});

async function observeRow(row: ReadingStateRow, platform: Platform) {
  host.platform = platform;
  localStorage.setItem('foliole-companion-reading-display',
    JSON.stringify({ hideSystemStatusBar: true, ...row.display }));
  if (row.paged) localStorage.setItem('foliole-companion-reading-mode', 'paged');
  const probe = createProbe();
  await row.run(probe, platform);
  probe.checkpoint();
  return probe.observe();
}

const onPlatform = (observation: Observation, platform: Platform): Observation =>
  platform === 'ios' ? { ...observation, bars: [] } : observation;

describe.each<Platform>(['android', 'ios'])('reading state table on %s', platform => {
  const rows = [...sessionRows, ...tapRows, ...windowRows].filter(row => row.platforms?.includes(platform) ?? true);
  for (const row of rows) {
    const name = `${row.scene} | ${row.event}`;
    const gap = row.gap && (row.gap.platforms?.includes(platform) ?? true) ? row.gap : null;
    if (!gap) {
      it(name, async () => {
        expect(await observeRow(row, platform)).toEqual(onPlatform(row.expected, platform));
      });
      continue;
    }
    // The passing `now` case proves the scene works, so the expected failure below fails for the recorded gap.
    it(`${name} | today (T886-${gap.closure} pending)`, async () => {
      expect(await observeRow(row, platform)).toEqual(onPlatform(gap.now, platform));
    });
    it.fails(`${name} | target of T886-${gap.closure}`, async () => {
      expect(await observeRow(row, platform)).toEqual(onPlatform(row.expected, platform));
    });
  }
});
