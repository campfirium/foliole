import { ChevronRight, FileText, Folder } from 'lucide-react';

import { useTranslation, type Translate } from '../localization/LocalizationProvider';

export interface NodeBrowseListItem {
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  kind?: 'folder' | 'topic' | 'item';
  nodeId: string;
  preview: string | null;
  title: string;
}

function buildOpenLabel(title: string, t: Translate, kind?: NodeBrowseListItem['kind']) {
  if (kind === 'folder') {
    return t('desktop.nodeBrowse.openFolder', { title });
  }
  return t('desktop.nodeBrowse.openTopic', { title });
}

function renderBodyStatus(status: NodeBrowseListItem['bodyStatus'], t: Translate) {
  if (status === 'failed') {
    return t('desktop.nodeBrowse.bodyUnavailable');
  }
  if (status === 'empty') {
    return t('desktop.nodeBrowse.emptyTopic');
  }
  return null;
}

function NodeBrowseIcon(props: { kind?: NodeBrowseListItem['kind'] }) {
  const Icon = props.kind === 'folder' ? Folder : FileText;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-companion-subtle/45 text-companion-text-secondary">
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

export function NodeBrowseList(props: {
  currentNodeId: string | null;
  emptyLabel: string;
  items: NodeBrowseListItem[];
  onSelectNode(nodeId: string): void;
}) {
  const t = useTranslation();
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
        const bodyStatusLabel = renderBodyStatus(item.bodyStatus, t);
        return (
          <button
            key={item.nodeId}
            aria-label={buildOpenLabel(item.title, t, item.kind)}
            className={`flex min-h-16 w-full items-center gap-2.5 border-b px-1 py-2 text-left transition-colors ${
              item.nodeId === props.currentNodeId
                ? 'border-companion-divider bg-companion-subtle'
                : 'border-companion-divider bg-transparent hover:bg-companion-subtle/60 active:bg-companion-subtle/80'
            }`}
            onClick={() => props.onSelectNode(item.nodeId)}
            type="button"
          >
            <NodeBrowseIcon kind={item.kind} />
            <span className="min-w-0 flex-1">
              <h2 className={`text-[15.5px] font-medium leading-5 text-foreground/90 ${item.kind === 'folder' ? 'truncate' : 'line-clamp-2'}`}>{item.title}</h2>
              {bodyStatusLabel ? (
                <span className="mt-1 block text-[13px] font-medium leading-[18px] text-companion-text-tertiary">{bodyStatusLabel}</span>
              ) : null}
              {item.preview ? (
                <span className="mt-1 block line-clamp-1 text-[13px] leading-[18px] text-companion-text-tertiary">{item.preview}</span>
              ) : null}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-companion-text-tertiary/90" />
          </button>
        );
      })}
    </section>
  );
}