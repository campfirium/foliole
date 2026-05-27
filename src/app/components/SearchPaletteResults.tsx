import { useEffect, useRef } from 'react';

import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceRuntimeRepository';
import {
  appFloatingEmptyStateClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingMetaBadgeClassName,
  appFloatingSectionHeaderClassName
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
  const label = query.trim() ? 'No matching results' : null;
  const className = appFloatingListClassName('min-h-56');
  if (!label) return <div aria-hidden="true" className={className} />;
  return (
    <ul className={className}>
      <li className={appFloatingEmptyStateClassName()}>{label}</li>
    </ul>
  );
}

export function SearchPaletteErrorState() {
  return (
    <ul className={appFloatingListClassName()}>
      <li className={appFloatingEmptyStateClassName()}>Search is unavailable. Try again in a moment.</li>
    </ul>
  );
}

export function SearchPaletteList(props: {
  activeIndex: number;
  externalSectionStatus: string | null;
  nodesById: WorkspaceListNodesById;
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void;
  onSetActiveIndex: (value: number | ((current: number) => number)) => void;
  query: string;
  results: WorkspaceSearchResult[];
  sourceDetailsByNodeId: Record<string, RuntimeNodeSourceDetails | null | undefined>;
}) {
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const activeRow = listRef.current?.querySelector('[data-search-result-active="true"]');
    activeRow?.scrollIntoView?.({ block: 'nearest' });
  }, [props.activeIndex]);

  if (!props.results.length) return null;

  return (
    <ul
      aria-label="Workspace search results"
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
          externalSectionStatus={props.externalSectionStatus}
          index={index}
          item={item}
          key={`${item.id}-${item.kind}-${index}`}
          nodesById={props.nodesById}
          onOpenResult={props.onOpenResult}
          onSetActiveIndex={props.onSetActiveIndex}
          previousKind={props.results[index - 1]?.kind}
          query={props.query}
          sourceDetails={props.sourceDetailsByNodeId[item.id]}
        />
      ))}
    </ul>
  );
}

function SearchPaletteResultItem(props: {
  active: boolean;
  externalSectionStatus: string | null;
  index: number;
  item: WorkspaceSearchResult;
  nodesById: WorkspaceListNodesById;
  onOpenResult: (result: WorkspaceSearchResult, options?: { preview?: boolean }) => void;
  onSetActiveIndex: (value: number | ((current: number) => number)) => void;
  previousKind: WorkspaceSearchResult['kind'] | undefined;
  query: string;
  sourceDetails: RuntimeNodeSourceDetails | null | undefined;
}) {
  const item = props.item;
  const projectResultText = item.kind === 'node';
  return (
    <li className="relative">
      {props.index === 0 || props.previousKind !== item.kind ? (
        <SearchPaletteSectionHeader
          externalSectionStatus={props.externalSectionStatus}
          kind={item.kind}
        />
      ) : null}
      <button
        className={appFloatingItemClassName('grid gap-1.5 data-[active=true]:bg-[var(--app-floating-item-active-bg)]')}
        data-active={props.active}
        data-search-result-active={props.active}
        onClick={(event) => props.onOpenResult(item, { preview: event.shiftKey })}
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

function SearchPaletteSectionHeader(props: {
  externalSectionStatus: string | null;
  kind: WorkspaceSearchResult['kind'];
}) {
  return (
    <div className={appFloatingSectionHeaderClassName('flex items-center justify-between gap-3')}>
      <span>{props.kind === 'external' ? 'External folders' : props.kind === 'removed' ? 'Removed' : 'Foliole content'}</span>
      {props.kind === 'external' && props.externalSectionStatus ? (
        <span className={appFloatingMetaBadgeClassName('normal-case tracking-normal')}>
          {props.externalSectionStatus}
        </span>
      ) : null}
    </div>
  );
}

function SearchPaletteResultMeta(props: {
  item: WorkspaceSearchResult;
  nodesById: WorkspaceListNodesById;
  sourceDetails: RuntimeNodeSourceDetails | null | undefined;
}) {
  return (
    <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[11px] text-foreground/45">
      <span className="min-w-0 truncate opacity-85">
        {resolveSearchResultPathLabel(props.item, props.nodesById)}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {props.item.kind === 'external'
          ? renderSearchResultMetaBadge(resolveExternalFolderLabel(props.item))
          : null}
        {renderSearchResultMetaBadge(resolveSearchResultNodeBadge(props.item, props.nodesById))}
        {renderSearchResultSourceLabel(props.sourceDetails)}
      </span>
    </span>
  );
}
