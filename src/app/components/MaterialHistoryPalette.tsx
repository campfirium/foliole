import { Pin } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appFloatingEmptyStateClassName, appFloatingInputClassName, appFloatingItemClassName, appFloatingOverlayClassName, appFloatingSurfaceClassName } from '../../shared/ui';
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
  const entries = filterMaterialHistory(history, state.nodesById, query);
  const [selected, setSelected] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const focusTrap = useFloatingDialogFocusTrap();
  useFloatingPaletteEscape(true, onClose);
  const searchRef = useRef<HTMLInputElement>(null);
  const rows = entries;

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    resultsRef.current?.children[selected]?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

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
    <div aria-label={label} aria-modal="true" className={appFloatingOverlayClassName()} onClick={onClose} role="dialog">
      <div className={appFloatingSurfaceClassName('panel', 'flex h-[min(560px,80dvh)] w-full max-w-2xl flex-col overflow-hidden')}
        onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { focusTrap.handleKeyDown(event); handleResultsKey(event, {
          onPin: () => { void pinRow(selected); }, onOpen: openRow,
          onSelect: setSelected, selected, size: rows.length, results: resultsRef.current
        }); }} ref={focusTrap.containerRef}>
        <HistorySearch inputRef={searchRef} query={query} onChange={(value) => {
          setQuery(value);
          setSelected(0);
          if (resultsRef.current) resultsRef.current.scrollTop = 0;
        }} />
        <div aria-label={label} className={`${floatingResultListClassName} overscroll-contain focus:outline-none`} ref={resultsRef} tabIndex={0}>
          {!rows.length && <p className={appFloatingEmptyStateClassName()}>{t(query.trim() ? 'desktop.history.noMatches' : 'desktop.history.empty')}</p>}
          <HistoryRows rows={rows} nodes={state.nodesById} selected={selected} onOpen={openRow} onPin={(index) => { void pinRow(index); }} />
        </div>
        {rows.length > 0 && <HistoryFooter />}
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
  let action: (() => void) | undefined;
  if (listFocused && event.key === ' ' && !event.shiftKey) {
    action = () => { if (!event.repeat) onPin(); };
  } else if (event.key === 'ArrowUp') {
    action = () => onSelect(Math.max(0, selected - 1));
  } else if (event.key === 'ArrowDown') {
    action = () => onSelect(Math.max(0, Math.min(size - 1, selected + 1)));
  } else if ((listFocused || typing) && event.key === 'Enter') {
    action = () => onOpen(selected);
  }
  if (!action) return;
  event.preventDefault();
  action();
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
    const path = materialHistoryPath(nodes, node.parentNodeId);
    return (
      <div className={`group relative ${floatingResultRowClassName}`} key={node.id}>
        <button aria-labelledby={path ? `${bodyId} ${pathId}` : bodyId}
          className={appFloatingItemClassName('absolute inset-0 rounded-lg')}
          data-active={index === selected} onClick={() => onOpen(index)} type="button" />
        <span id={bodyId} className={`pointer-events-none relative min-w-0 font-normal text-foreground ${floatingResultPreviewClassName}`}>
          {materialHistoryPreview(node)}
        </span>
        <div className={`pointer-events-none relative flex min-w-0 items-center gap-1.5 ${floatingResultMetaClassName}`}>
          {path && <span id={pathId} className="min-w-0 break-words opacity-85">{path}</span>}
          <button aria-label={t('desktop.history.pin')} aria-pressed={pinned}
            className={`grid size-5 shrink-0 place-items-center rounded hover:bg-[var(--app-floating-item-hover-bg)] ${pinned ? 'pointer-events-auto text-foreground/80' : 'opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100'}`}
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
  return (
    <footer className="flex shrink-0 items-center px-4 py-2 text-xs text-foreground/65">
      <span className="flex flex-wrap items-center gap-3">
        <span><kbd className="rounded border border-border px-1">↑ ↓</kbd> {t('desktop.history.select')}</span>
        <span><kbd className="rounded border border-border px-1">↵</kbd> {t('desktop.history.open')}</span>
      </span>
    </footer>
  );
}

function HistorySearch({ inputRef, query, onChange }: {
  inputRef: React.Ref<HTMLInputElement>;
  query: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslation();
  const label = t('desktop.history.search');
  return (
    <input ref={inputRef} aria-label={label} className={appFloatingInputClassName('shrink-0')}
      autoComplete="off" spellCheck={false}
      onChange={(event) => onChange(event.target.value)} placeholder={label} type="search" value={query} />
  );
}
