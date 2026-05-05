import type { Node } from '../../features/nodes/model/nodeTypes';

interface FolderListViewProps {
  folderNodeId: string;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)(?:\s+id="[^"]+")?\s*>/g;
const SUMMARY_FALLBACK = 'No summary yet.';

function getDirectChildNodes(folderNodeId: string, nodeOrder: string[], nodesById: Record<string, Node>) {
  return nodeOrder
    .map((nodeId) => nodesById[nodeId])
    .filter((node): node is Node => Boolean(node && node.parentNodeId === folderNodeId));
}

function formatItemCount(count: number) {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

function stripMarkdownLinePrefix(line: string) {
  return line
    .trim()
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#{1,6}\s+/, '');
}

function stripMarkdownInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]+/g, '');
}

function normalizePreviewText(content: string) {
  return stripMarkdownInline(
    content
      .replace(ANCHOR_TAG_PATTERN, '')
      .split(/\r?\n/)
      .map((line) => stripMarkdownLinePrefix(line))
      .join(' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function getNodeExcerpt(node: Node) {
  const normalizedContent = normalizePreviewText(node.content);
  if (!normalizedContent) {
    return SUMMARY_FALLBACK;
  }

  const normalizedTitle = node.title.trim().replace(/\s+/g, ' ');
  const lowerTitle = normalizedTitle.toLocaleLowerCase();
  const lowerContent = normalizedContent.toLocaleLowerCase();
  if (lowerTitle && lowerContent.startsWith(lowerTitle)) {
    const remainder = normalizedContent.slice(normalizedTitle.length).replace(/^[\s:：,-]+/, '').trim();
    return remainder || SUMMARY_FALLBACK;
  }

  return normalizedContent;
}

function formatNodeDate(timestamp: string) {
  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Unknown date';
  }
  return parsedDate.toISOString().slice(0, 10);
}

function renderAuthorSlot(nodeId: string) {
  return (
    <span
      aria-label="Author unavailable"
      className="block min-h-4 min-w-0 truncate text-xs text-foreground/52"
      data-testid={`folder-list-author-${nodeId}`}
    />
  );
}

function FolderListHeader({ itemCount }: { itemCount: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div aria-label="Folder list sorting" className="flex items-center gap-2 text-sm text-foreground/72">
        <span className="font-medium text-foreground">Sort</span>
        <span className="rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-xs font-medium text-foreground/78">
          Manual order
        </span>
      </div>
      <p className="text-sm text-foreground/65">{formatItemCount(itemCount)}</p>
    </div>
  );
}

function FolderListEmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="max-w-md text-center">
        <p className="text-base font-semibold text-foreground">This folder is empty</p>
        <p className="mt-2 text-sm leading-6 text-foreground/68">
          Direct children will appear here after you add notes, folders, or items to this folder.
        </p>
      </div>
    </div>
  );
}

function FolderListItem(props: { node: Node; onSelectNode: (nodeId: string) => void }) {
  return (
    <li>
      <button
        aria-label={`Open ${props.node.title}`}
        className="flex w-full flex-col gap-3 rounded-[var(--radius-2)] border border-transparent px-4 py-3 text-left transition-colors hover:bg-bg-elevated focus-visible:border-border focus-visible:bg-bg-elevated focus-visible:outline-none"
        onClick={() => props.onSelectNode(props.node.id)}
        type="button"
      >
        <span className="block min-w-0">
          <span
            className="line-clamp-2 block break-words text-sm font-semibold leading-5 text-foreground"
            data-testid={`folder-list-title-${props.node.id}`}
          >
            {props.node.title}
          </span>
          <span
            className="mt-1 block min-h-10 line-clamp-2 text-xs leading-5 text-foreground/62"
            data-testid={`folder-list-excerpt-${props.node.id}`}
          >
            {getNodeExcerpt(props.node)}
          </span>
        </span>
        <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          {renderAuthorSlot(props.node.id)}
          <span className="shrink-0 text-xs text-foreground/56" data-testid={`folder-list-date-${props.node.id}`}>
            {formatNodeDate(props.node.updatedAt)}
          </span>
        </span>
      </button>
    </li>
  );
}

export function FolderListView({ folderNodeId, nodeOrder, nodesById, onSelectNode }: FolderListViewProps) {
  const childNodes = getDirectChildNodes(folderNodeId, nodeOrder, nodesById);

  return (
    <div className="flex min-h-0 flex-1 px-4 pt-4 pb-4 max-[1080px]:px-2 max-[1080px]:pt-2">
      <section
        aria-label="Folder list view"
        className="mx-auto flex min-h-0 w-full max-w-[var(--document-max-width)] flex-1 flex-col overflow-hidden rounded-[var(--radius-3)] border border-border bg-bg-panel"
      >
        <FolderListHeader itemCount={childNodes.length} />

        {childNodes.length === 0 ? (
          <FolderListEmptyState />
        ) : (
          <ul aria-label="Folder contents" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
            {childNodes.map((node) => (
              <FolderListItem key={node.id} node={node} onSelectNode={onSelectNode} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
