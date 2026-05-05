import { useEffect, useState } from 'react';

import { readDebugTraces, type DebugTraceEntry } from '../../shared/testing/debugBridge';
import { InspectorSection } from '../../shared/ui';

const MAX_READING_TRACE_COUNT = 20;
const TRACE_POLL_INTERVAL_MS = 300;
const READING_TRACE_KEYWORDS = [
  'reading',
  'scroll-sync',
  'restore-selection',
  'immersive.toggle',
  'immersive.entry-selection',
  'immersive.viewport-reading.sampled',
  'editor.viewport'
] as const;

function isReadingTrace(entry: DebugTraceEntry) {
  return READING_TRACE_KEYWORDS.some((keyword) => entry.event.includes(keyword));
}

function formatSelection(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return 'No selection';
  }
  const record = payload as {
    lineText?: string | null;
    position?: number | null;
    reason?: string;
    selection?: { from?: number; to?: number };
  };
  const selection = record.selection;
  if (selection && typeof selection.from === 'number' && typeof selection.to === 'number') {
    return `${selection.from} -> ${selection.to}`;
  }
  if (typeof record.position === 'number') {
    return `pos ${record.position}`;
  }
  if (record.reason) {
    return record.reason;
  }
  return 'No selection';
}

function formatDetails(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const record = payload as {
    lineText?: string | null;
    position?: number | null;
  };
  if (record.lineText && record.lineText.trim().length > 0) {
    return `  ${record.lineText}`;
  }
  if (typeof record.position === 'number') {
    return `  sampled:${record.position}`;
  }
  return '';
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function buildTraceLabel(entry: DebugTraceEntry) {
  return `${formatTime(entry.timestamp)}  ${entry.event}  ${formatSelection(entry.payload)}${formatDetails(entry.payload)}`;
}

function collapseTraceEntries(entries: DebugTraceEntry[]) {
  return entries.reduce<Array<{ count: number; entry: DebugTraceEntry }>>((collapsed, entry) => {
    const previous = collapsed[collapsed.length - 1];
    const currentLabel = buildTraceLabel(entry);
    const previousLabel = previous ? buildTraceLabel(previous.entry) : null;
    if (previous && previousLabel === currentLabel) {
      previous.count += 1;
      return collapsed;
    }
    collapsed.push({ count: 1, entry });
    return collapsed;
  }, []);
}

function useReadingTraceEntries() {
  const [entries, setEntries] = useState<Array<{ count: number; entry: DebugTraceEntry }>>(() =>
    collapseTraceEntries(readDebugTraces().filter(isReadingTrace).slice(-MAX_READING_TRACE_COUNT).reverse())
  );

  useEffect(() => {
    const syncEntries = () => {
      setEntries(collapseTraceEntries(readDebugTraces().filter(isReadingTrace).slice(-MAX_READING_TRACE_COUNT).reverse()));
    };
    syncEntries();
    const timer = window.setInterval(syncEntries, TRACE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return entries;
}

export function WorkspaceRightSidebarReadingPositionLog() {
  const entries = useReadingTraceEntries();

  return (
    <InspectorSection
      contentClassName="flex flex-col gap-1"
      description="Recent reading-position changes. Newest first."
      title="Reading position log"
    >
      {entries.length === 0 ? (
        <p className="text-sm text-foreground/60">No reading-position events yet.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {entries.map(({ count, entry }, index) => (
            <li
              className="rounded-md border border-border/70 bg-canvas px-2 py-1 font-mono text-[11px] leading-5 text-foreground"
              key={`${entry.timestamp}-${entry.event}-${index}`}
            >
              {buildTraceLabel(entry)}
              {count > 1 ? `  x${count}` : ''}
            </li>
          ))}
        </ol>
      )}
    </InspectorSection>
  );
}
