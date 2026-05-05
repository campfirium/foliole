import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';
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
  const label = query.trim() ? 'No matching results' : 'Search across notes and external folders';
  return (
    <ul className={appFloatingListClassName()}>
      <li className={appFloatingEmptyStateClassName()}>{label}</li>
    </ul>
  );
}

export function SearchPaletteList(props: {
  activeIndex: number;
  externalSectionStatus: string | null;
  nodesById: WorkspaceListNodesById;
  onOpenResult: (result: WorkspaceSearchResult) => void;
  query: string;
  results: WorkspaceSearchResult[];
  sourceDetailsByNodeId: Record<string, RuntimeNodeSourceDetails | null | undefined>;
}) {
  if (!props.results.length) return null;

  return (
    <ul aria-label="Workspace search results" className={appFloatingListClassName()}>
      {props.results.map((item, index) => (
        <li key={`${item.id}-${item.kind}-${index}`}>
          {index === 0 || props.results[index - 1]?.kind !== item.kind ? (
            <div
              className={appFloatingSectionHeaderClassName(
                'flex items-center justify-between gap-3'
              )}
            >
              <span>{item.kind === 'external' ? 'External folders' : 'Foliole content'}</span>
              {item.kind === 'external' && props.externalSectionStatus ? (
                <span className={appFloatingMetaBadgeClassName('normal-case tracking-normal')}>
                  {props.externalSectionStatus}
                </span>
              ) : null}
            </div>
          ) : null}
          <button
            className={appFloatingItemClassName('grid gap-1.5')}
            data-active={index === props.activeIndex}
            onClick={() => props.onOpenResult(item)}
            type="button"
          >
            <span className="min-w-0 truncate text-[15px] font-semibold leading-5 text-foreground">
              {renderSearchResultText(item.title, props.query)}
            </span>
            <span className="line-clamp-2 text-[13px] leading-5 text-foreground/60">
              {renderSearchResultText(resolveSearchResultContext(item), props.query)}
            </span>
            <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[11px] text-foreground/45">
              <span className="min-w-0 truncate opacity-85">
                {resolveSearchResultPathLabel(item, props.nodesById)}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {item.kind === 'external'
                  ? renderSearchResultMetaBadge(resolveExternalFolderLabel(item))
                  : null}
                {renderSearchResultMetaBadge(resolveSearchResultNodeBadge(item, props.nodesById))}
                {renderSearchResultSourceLabel(props.sourceDetailsByNodeId[item.id])}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
