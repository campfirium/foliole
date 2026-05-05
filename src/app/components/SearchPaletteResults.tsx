import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import type { RuntimeNodeSourceDetails } from '../../shared/platform/nodeSourceBridge';

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
    <ul className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
      <li className="px-3 py-8 text-center text-sm text-foreground/55">{label}</li>
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
    <ul aria-label="Workspace search results" className="app-scrollbar max-h-[50vh] overflow-y-auto p-1">
      {props.results.map((item, index) => (
        <li key={`${item.id}-${item.kind}-${index}`}>
          {index === 0 || props.results[index - 1]?.kind !== item.kind ? (
            <div className="flex items-center justify-between gap-3 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45">
              <span>{item.kind === 'external' ? 'External folders' : 'Foliole content'}</span>
              {item.kind === 'external' && props.externalSectionStatus ? (
                <span className="truncate rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-foreground/60">
                  {props.externalSectionStatus}
                </span>
              ) : null}
            </div>
          ) : null}
          <button
            className="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left hover:bg-bg-subtle data-[active=true]:bg-bg-subtle"
            data-active={index === props.activeIndex}
            onClick={() => props.onOpenResult(item)}
            type="button"
          >
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{renderSearchResultText(item.title, props.query)}</span>
            <span className="line-clamp-2 text-xs text-foreground/60">{renderSearchResultText(resolveSearchResultContext(item), props.query)}</span>
            <span className="flex items-center justify-between gap-3 text-[11px] text-foreground/45">
              <span className="min-w-0 truncate">{resolveSearchResultPathLabel(item, props.nodesById)}</span>
              <span className="flex shrink-0 items-center gap-1">
                {item.kind === 'external' ? renderSearchResultMetaBadge(resolveExternalFolderLabel(item)) : null}
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
