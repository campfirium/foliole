import { useEffect, useRef } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName
} from '../../shared/ui';

import {
  resolveExternalFolderLabel,
  renderSearchResultMetaBadge,
  renderSearchResultSourceLabel,
  renderSearchResultText,
  resolveSearchResultContext,
  resolveSearchResultNodeBadge,
  resolveSearchResultPathLabel
} from './searchPaletteResultPresentation';
import type { WorkspaceSearchResult } from './workspaceSearch';

export function SearchPaletteEmptyState({ query }: { query: string }) {
  const t = useTranslation();
  const label = query.trim() ? t('desktop.search.noMatches') : null;
  const className = appFloatingListClassName('min-h-56');
  if (!label) return <div aria-hidden="true" className={className} />;
  return (
    <ul className={className}>
      <li className={appFloatingEmptyStateClassName()}>{label}</li>
    </ul>
  );
}

export function SearchPaletteErrorState() {
  const t = useTranslation();
  return (
    <ul className={appFloatingListClassName()}>
      <li className={appFloatingEmptyStateClassName()}>{t('desktop.search.unavailable')}</li>
    </ul>
  );
}

export function SearchPaletteList(props: {
  activeIndex: number;
  nodesById: WorkspaceListNodesById;
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void;
  onSetActiveIndex: (value: number | ((current: number) => number)) => void;
  query: string;
  results: WorkspaceSearchResult[];
  sourceDetailsByNodeId: Record<string, RuntimeNodeSourceDetails | null | undefined>;
}) {
  const t = useTranslation();
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const activeRow = listRef.current?.querySelector('[data-search-result-active="true"]');
    activeRow?.scrollIntoView?.({ block: 'nearest' });
  }, [props.activeIndex]);

  if (!props.results.length) return null;

  return (
    <ul
      aria-label={t('desktop.search.results.aria')}
      className={appFloatingListClassName()}
      ref={listRef}
      onWheel={(event) => {
        if (Math.abs(event.deltaY) < 12) return;
        props.onSetActiveIndex((current) =>
          event.deltaY > 0
            ? Math.min(current + 1, props.results.length - 1)
            : Math.max(current - 1, 0)
        );
      }}
    >
      {props.results.map((item, index) => (
        <SearchPaletteResultItem
          active={index === props.activeIndex}
          item={item}
          key={`${item.id}-${item.kind}-${index}`}
          nodesById={props.nodesById}
          onOpenResult={props.onOpenResult}
          onSetActiveIndex={props.onSetActiveIndex}
          index={index}
          query={props.query}
          sourceDetails={props.sourceDetailsByNodeId[item.id]}
        />
      ))}
    </ul>
  );
}

function SearchPaletteResultItem(props: {
  active: boolean;
  index: number;
  item: WorkspaceSearchResult;
  nodesById: WorkspaceListNodesById;
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void;
  onSetActiveIndex: (value: number | ((current: number) => number)) => void;
  query: string;
  sourceDetails: RuntimeNodeSourceDetails | null | undefined;
}) {
  const item = props.item;
  const projectResultText = item.kind === 'node';
  return (
    <li className="relative">
      <button
        className={appFloatingItemClassName('grid gap-1.5 data-[active=true]:bg-[var(--app-floating-item-active-bg)]')}
        data-active={props.active}
        data-search-result-active={props.active}
        onClick={(event) => props.onOpenResult(item, { preview: event.shiftKey })}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => props.onSetActiveIndex(props.index)}
        type="button"
      >
        <span className="min-w-0 truncate text-[15px] font-semibold leading-5 text-foreground">
          {renderSearchResultText(item.title, props.query, { project: projectResultText })}
        </span>
        <span className="line-clamp-2 text-[13px] leading-5 text-foreground/60">
          {renderSearchResultText(resolveSearchResultContext(item), props.query, { project: projectResultText })}
        </span>
        <SearchPaletteResultMeta
          item={item}
          nodesById={props.nodesById}
          sourceDetails={props.sourceDetails}
        />
      </button>
    </li>
  );
}

function SearchPaletteResultMeta(props: {
  item: WorkspaceSearchResult;
  nodesById: WorkspaceListNodesById;
  sourceDetails: RuntimeNodeSourceDetails | null | undefined;
}) {
  const t = useTranslation();
  const pathLabel = resolveSearchResultPathLabel(props.item, props.nodesById, t) ?? t('desktop.search.context.topLevel');
  return (
    <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[11px] text-foreground/45">
      <span className="min-w-0 truncate opacity-85">
        {pathLabel}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {props.item.kind === 'external'
          ? renderSearchResultMetaBadge(resolveExternalFolderLabel(props.item))
          : null}
        {renderSearchResultMetaBadge(resolveSearchResultNodeBadge(props.item, props.nodesById, t))}
        {renderSearchResultSourceLabel(props.sourceDetails)}
      </span>
    </span>
  );
}
