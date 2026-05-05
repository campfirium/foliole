export interface NodeBrowseListItem {
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  kind?: 'folder' | 'topic' | 'item';
  nodeId: string;
  preview: string | null;
  title: string;
}

function buildOpenLabel(title: string, kind?: NodeBrowseListItem['kind']) {
  if (kind === 'folder') {
    return `Open folder ${title}`;
  }
  return `Open topic ${title}`;
}

function renderBodyStatus(status: NodeBrowseListItem['bodyStatus']) {
  if (status === 'failed') {
    return 'Topic body unavailable';
  }
  if (status === 'empty') {
    return 'Empty topic';
  }
  return null;
}

export function NodeBrowseList(props: {
  currentNodeId: string | null;
  emptyLabel: string;
  items: NodeBrowseListItem[];
  onSelectNode(nodeId: string): void;
}) {
  if (props.items.length === 0) {
    return (
      <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
        {props.emptyLabel}
      </section>
    );
  }

  return (
    <section className="border-t border-companion-divider">
      {props.items.map((item) => {
        const bodyStatusLabel = renderBodyStatus(item.bodyStatus);
        return (
          <button
            key={item.nodeId}
            aria-label={buildOpenLabel(item.title, item.kind)}
            className={`block w-full border-b px-1 py-4 text-left transition-colors ${
              item.nodeId === props.currentNodeId
                ? 'border-companion-divider bg-companion-subtle'
                : 'border-companion-divider bg-transparent hover:bg-companion-subtle/60'
            }`}
            onClick={() => props.onSelectNode(item.nodeId)}
            type="button"
          >
            <h2 className="text-[18px] font-semibold leading-7 text-foreground">{item.title}</h2>
            {bodyStatusLabel ? (
              <p className="mt-1 text-xs font-medium leading-5 text-companion-text-secondary">{bodyStatusLabel}</p>
            ) : null}
            {item.preview ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-companion-text-secondary">{item.preview}</p> : null}
          </button>
        );
      })}
    </section>
  );
}
