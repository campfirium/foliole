import { Bookmark, BookmarkCheck, Clock } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppTooltip, AppTooltipContent, AppTooltipTrigger,
  appFloatingEmptyStateClassName, appFloatingInputClassName, appFloatingItemClassName
} from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { floatingResultListClassName } from '../../shared/ui/FloatingSurface';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { filterMaterialHistory, materialHistoryPath, materialHistoryPreview, selectMaterialHistory } from './materialHistory';
import { MaterialHistoryViewOptions } from './MaterialHistoryViewOptions';
import { loadMaterialHistoryView, saveMaterialHistoryView, type MaterialHistoryView } from './materialHistoryViewPreference';
import { useFloatingDialogFocusTrap } from './useFloatingDialogFocusTrap';
import { useFloatingPaletteEscape } from './useFloatingPaletteEscape';
import { useMaterialHistoryOrdering } from './useMaterialHistoryOrdering';
import { WorkspacePaletteFrame, workspacePaletteOverlayClassName } from './WorkspacePaletteFrame';
import {
  WorkspaceResultHeader, workspaceResultInputClassName
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
  const [view, setView] = useState(loadMaterialHistoryView);
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
    <div aria-label={label} aria-modal="true" className={workspacePaletteOverlayClassName} onClick={onClose} role="dialog">
      <WorkspacePaletteFrame
        onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { focusTrap.handleKeyDown(event); handleResultsKey(event, {
          onPin: () => { void pinRow(selected); }, onOpen: openRow,
          onSelect: (index) => setSelectedId(rows[index]?.node.id ?? null),
          selected, size: rows.length, results: resultsRef.current
        }); }} ref={focusTrap.containerRef}>
        <HistorySearch query={query} onChange={(value) => {
          setQuery(value);
          setSelectedId(null);
          if (resultsRef.current) resultsRef.current.scrollTop = 0;
        }}>
          <MaterialHistoryViewOptions view={view} onChange={next => {
            setView(next);
            saveMaterialHistoryView(next);
          }} />
        </HistorySearch>
        <div aria-label={label} className={`${floatingResultListClassName} overscroll-contain focus:outline-none!`} ref={resultsRef} role="group" tabIndex={0}>
          {!rows.length && <p className={appFloatingEmptyStateClassName()}>{t(query.trim() ? 'desktop.history.noMatches' : 'desktop.history.empty')}</p>}
          <HistoryRows view={view} rows={rows} nodes={state.nodesById} selected={selected} onOpen={openRow} onPin={(index) => { void pinRow(index); }} />
        </div>
        <HistoryFooter />
      </WorkspacePaletteFrame>
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
  const typing = event.target instanceof HTMLInputElement && event.target.type === 'search';
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

function HistoryRows({ rows, nodes, selected, onOpen, onPin, view }: {
  view: MaterialHistoryView;
  rows: ReturnType<typeof selectMaterialHistory>;
  nodes: Parameters<typeof materialHistoryPath>[0];
  selected: number;
  onOpen: (index: number) => void;
  onPin: (index: number) => void;
}) {
  const rowId = useId();
  return rows.map(({ node, pinned }, index) => {
    const bodyId = `${rowId}-body-${index}`;
    const pathId = `${rowId}-path-${index}`;
    const path = materialHistoryPath(nodes, node.id);
    const breadcrumbFirst = view.first === 'breadcrumb' && Boolean(path);
    const preview = (
      <span id={bodyId} className={`pointer-events-none relative min-w-0 line-clamp-2 break-words text-ui-base leading-5 ${breadcrumbFirst ? 'text-foreground/75' : 'text-foreground/90'}`}
        style={{ WebkitLineClamp: view.lines }}>
        {materialHistoryPreview(node)}
      </span>
    );
    const metadata = (
      <div className="pointer-events-none relative flex min-w-0 items-center gap-2">
        {path && <span id={pathId} className={`min-w-0 break-words ${breadcrumbFirst ? 'text-ui-base font-medium leading-5 text-foreground/90' : 'text-xs leading-4 text-foreground/65'}`}>{path}</span>}
        <HistoryBookmark pinned={pinned} selected={index === selected} onClick={() => onPin(index)} />
      </div>
    );
    return (
      <div className="group relative grid gap-0.5 px-3 py-2" key={node.id}>
        <button aria-labelledby={path ? (breadcrumbFirst ? `${pathId} ${bodyId}` : `${bodyId} ${pathId}`) : bodyId}
          className={appFloatingItemClassName('absolute inset-0 rounded-md forced-colors:data-[active=true]:outline-1 forced-colors:data-[active=true]:outline-[Highlight]')}
          aria-current={index === selected || undefined} data-active={index === selected} onClick={() => onOpen(index)} type="button" />
        {breadcrumbFirst ? <>{metadata}{preview}</> : <>{preview}{metadata}</>}
      </div>
    );
  });
}

function HistoryBookmark({ pinned, selected, onClick }: {
  pinned: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const t = useTranslation();
  const Icon = pinned ? BookmarkCheck : Bookmark;
  const visibility = pinned || selected
    ? 'pointer-events-auto'
    : 'opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100';

  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <button aria-label={t('desktop.history.pin')} aria-pressed={pinned}
          className={`ms-auto grid size-5 shrink-0 place-items-center rounded transition-colors hover:bg-[var(--app-floating-item-hover-bg)] hover:text-foreground focus-visible:text-foreground ${pinned ? 'text-foreground/75' : 'text-foreground/55'} ${visibility}`}
          onClick={onClick} type="button">
          <Icon aria-hidden="true" className="size-3.5" />
        </button>
      </AppTooltipTrigger>
      <AppTooltipContent side="top">
        {t(pinned ? 'desktop.history.unpinHint' : 'desktop.history.pinHint')}
      </AppTooltipContent>
    </AppTooltip>
  );
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

function HistorySearch({ query, onChange, children }: {
  children: ReactNode;
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
      {children}
    </WorkspaceResultHeader>
  );
}
