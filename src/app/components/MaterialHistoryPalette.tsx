import { Clock, Pin } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingEmptyStateClassName, appFloatingInputClassName, appFloatingItemClassName } from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import {
  floatingResultListClassName, floatingResultMetaClassName,
  floatingResultPreviewClassName, floatingResultRowClassName
} from '../../shared/ui/FloatingSurface';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { filterMaterialHistory, materialHistoryPath, materialHistoryPreview, selectMaterialHistory } from './materialHistory';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';
import { useMaterialHistoryOrdering } from './useMaterialHistoryOrdering';
import {
  WorkspaceResultHeader, workspaceResultInputClassName,
  workspaceResultOverlayClassName, workspaceResultPanelClassName
} from './WorkspaceResultPalette';
import { WorkspaceResultShortcutsFooter } from './WorkspaceResultShortcutsFooter';

interface Props {
  onClose: () => void;
  onOpenNode: (id: string) => void;
}

export default function MaterialHistoryPalette({ onClose, onOpenNode }: Props) {
  const t = useTranslation();
  const state = useWorkspaceStore();
  const [query, setQuery] = useState('');
  const { ordering, togglePin } = useMaterialHistoryOrdering();
  const history = useMemo(() => selectMaterialHistory(state, ordering?.pins, ordering?.lastEdited), [state, ordering]);
  const rows = filterMaterialHistory(history, state.nodesById, query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.findIndex(({ node }) => node.id === selectedId);
  const resultsRef = useRef<HTMLDivElement>(null);
  const focusTrap = useFloatingDialogFocusTrap();
  useFloatingPaletteEscape(true, onClose);

  useEffect(() => { resultsRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    resultsRef.current?.children[selected]?.scrollIntoView?.({ block: 'nearest' });
  }, [selected, selectedId]);

  function openRow(index: number) {
    const entry = rows[index];
    if (!entry) return;
    onOpenNode(entry.node.id);
    onClose();
  }

  async function pinRow(index: number) {
    const entry = rows[index];
    if (entry && !await togglePin(entry.node.id)) {
      showAppRuntimeNotice(t('desktop.history.pinFailed'), 'error');
    }
  }

  const label = t('desktop.command.openMaterialHistory');
  return (
    <div aria-label={label} aria-modal="true" className={workspaceResultOverlayClassName} onClick={onClose} role="dialog">
      <div className={workspaceResultPanelClassName}
        onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { focusTrap.handleKeyDown(event); handleResultsKey(event, {
          onPin: () => { void pinRow(selected); }, onOpen: openRow,
          onSelect: (index) => setSelectedId(rows[index]?.node.id ?? null),
          selected, size: rows.length, results: resultsRef.current
        }); }} ref={focusTrap.containerRef}>
        <HistorySearch query={query} onChange={(value) => {
          setQuery(value);
          setSelectedId(null);
          if (resultsRef.current) resultsRef.current.scrollTop = 0;
        }} />
        <div aria-label={label} className={`${floatingResultListClassName} overscroll-contain focus:outline-none`} ref={resultsRef} role="group" tabIndex={0}>
          {!rows.length && <p className={appFloatingEmptyStateClassName()}>{t(query.trim() ? 'desktop.history.noMatches' : 'desktop.history.empty')}</p>}
          <HistoryRows rows={rows} nodes={state.nodesById} selected={selected} onOpen={openRow} onPin={(index) => { void pinRow(index); }} />
        </div>
        <HistoryFooter />
      </div>
    </div>
  );
}

function handleResultsKey(event: KeyboardEvent<HTMLDivElement>, options: {
  onPin: () => void;
  onOpen: (index: number) => void;
  onSelect: (index: number) => void;
  selected: number;
  size: number;
  results: HTMLDivElement | null;
}) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
  const { onPin, onOpen, onSelect, selected, size, results } = options;
  const typing = event.target instanceof HTMLInputElement;
  const listFocused = event.target === results;
  if ((!listFocused && !typing) || !results) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    if (!size) return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = selected < 0
      ? visibleHistoryRow(results, direction)
      : Math.max(0, Math.min(size - 1, selected + direction));
    onSelect(nextIndex);
    if (typing) results.focus({ preventScroll: true });
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (listFocused && selected >= 0) onOpen(selected);
  } else if (listFocused && event.key === ' ' && !event.shiftKey) {
    event.preventDefault();
    if (selected >= 0 && !event.repeat) onPin();
  }
}

function visibleHistoryRow(results: HTMLDivElement, direction: 1 | -1) {
  const { top, bottom } = results.getBoundingClientRect();
  const rows = Array.from(results.children);
  const isVisible = (row: Element) => {
    const rect = row.getBoundingClientRect();
    return rect.bottom > top && rect.top < bottom;
  };
  const index = direction === 1 ? rows.findIndex(isVisible) : rows.findLastIndex(isVisible);
  return index < 0 ? 0 : index;
}

function HistoryRows({ rows, nodes, selected, onOpen, onPin }: {
  rows: ReturnType<typeof selectMaterialHistory>;
  nodes: Parameters<typeof materialHistoryPath>[0];
  selected: number;
  onOpen: (index: number) => void;
  onPin: (index: number) => void;
}) {
  const t = useTranslation();
  const rowId = useId();
  return rows.map(({ node, pinned }, index) => {
    const bodyId = `${rowId}-body-${index}`;
    const pathId = `${rowId}-path-${index}`;
    const path = materialHistoryPath(nodes, node.id);
    return (
      <div className={`group relative ${floatingResultRowClassName}`} key={node.id}>
        <button aria-labelledby={path ? `${bodyId} ${pathId}` : bodyId}
          className={appFloatingItemClassName('absolute inset-0 rounded-lg')}
          aria-current={index === selected || undefined} data-active={index === selected} onClick={() => onOpen(index)} type="button" />
        <span id={bodyId} className={`pointer-events-none relative min-w-0 font-normal text-foreground ${floatingResultPreviewClassName}`}>
          {materialHistoryPreview(node)}
        </span>
        <div className={`pointer-events-none relative flex min-w-0 items-center gap-1.5 ${floatingResultMetaClassName}`}>
          {path && <span id={pathId} className="min-w-0 break-words opacity-85">{path}</span>}
          <button aria-label={t('desktop.history.pin')} aria-pressed={pinned}
            className={`ms-auto grid size-5 shrink-0 place-items-center rounded hover:bg-[var(--app-floating-item-hover-bg)] ${pinned ? 'pointer-events-auto text-foreground/80' : index === selected ? 'pointer-events-auto' : 'opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100'}`}
            onClick={() => onPin(index)} type="button">
            <Pin aria-hidden="true" className={`size-3.5 ${pinned ? '-rotate-45' : ''}`} />
          </button>
        </div>
      </div>
    );
  });
}

function HistoryFooter() {
  const t = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <WorkspaceResultShortcutsFooter
      collapsed={collapsed}
      onToggle={() => setCollapsed((value) => !value)}
      collapseLabel={t('desktop.history.collapseShortcuts')}
      showLabel={t('desktop.history.showShortcuts')}
      hints={[
        { keys: ['Enter'], label: t('desktop.history.open') },
        { keys: ['Space'], label: t('desktop.history.togglePin') }
      ]}
    />
  );
}

function HistorySearch({ query, onChange }: {
  query: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslation();
  const label = t('desktop.history.search');
  return (
    <WorkspaceResultHeader icon={Clock}>
      <input aria-label={label} className={appFloatingInputClassName(workspaceResultInputClassName)}
        autoComplete="off" spellCheck={false}
        onChange={(event) => onChange(event.target.value)} placeholder={label} type="search" value={query} />
    </WorkspaceResultHeader>
  );
}
