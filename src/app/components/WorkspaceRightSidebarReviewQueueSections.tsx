import type { Node } from '../../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode } from '../../features/review/model/reviewItemKind';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  inspectorListDividerLineClassName,
  inspectorListInsetClassName,
  inspectorListInsetPaddingClassName,
  inspectorListMetaClassName,
  inspectorListTitleClassName
} from '../../shared/ui';

export function buildDisplayQueueNodeIds(queueNodeIds: string[], currentNodeId: string | null) {
  const currentIndex = currentNodeId ? queueNodeIds.indexOf(currentNodeId) : -1;
  if (currentIndex <= 0) {
    return queueNodeIds;
  }
  return [...queueNodeIds.slice(currentIndex), ...queueNodeIds.slice(0, currentIndex)];
}

function getQueueItemTitle(node: Node | undefined, t: Translate) {
  if (!node) {
    return t('desktop.rightPanel.flow.missingTopic');
  }
  const title = node.title.trim();
  if (title.length > 0) {
    return title;
  }
  return t('desktop.rightPanel.flow.untitledTopic');
}

function QueueKindIcon({ kind }: { kind: 'item' | 'topic' }) {
  if (kind === 'item') {
    return (
      <svg aria-hidden="true" className="size-4 text-foreground/35" fill="none" focusable="false" viewBox="0 0 16 16">
        <polygon points="8,2.8 13.2,8 8,13.2 2.8,8" stroke="currentColor" strokeWidth="1.25" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="size-4 text-foreground/35" fill="none" focusable="false" viewBox="0 0 16 16">
      <polygon points="8,2.2 13.1,5.1 13.1,10.9 8,13.8 2.9,10.9 2.9,5.1" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function QueueRow(props: {
  index: number;
  node: Node;
  nodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const t = useTranslation();
  const kind = isFsrsReviewItemNode(props.node) ? 'item' : 'topic';
  return (
    <li className={`grid min-h-10 grid-cols-[2ch_1rem_minmax(0,1fr)] items-center gap-2 py-1.5 hover:bg-[var(--app-inspector-list-row-hover-bg)] ${inspectorListInsetPaddingClassName}`}>
      <span className={`${inspectorListMetaClassName} text-left tabular-nums text-foreground/28`}>{props.index + 1}</span>
      <QueueKindIcon kind={kind} />
      <button
        className={`${inspectorListTitleClassName} truncate text-left font-normal text-foreground/82 underline-offset-2 hover:text-foreground hover:underline focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
        onClick={() => props.onSelectNode(props.nodeId)}
        type="button"
      >
        {getQueueItemTitle(props.node, t)}
      </button>
    </li>
  );
}

function FlowSectionHeading({
  heading,
  showDivider
}: {
  heading?: string | undefined;
  showDivider: boolean;
}) {
  if (!heading) {
    return showDivider ? <li className={`${inspectorListInsetClassName} my-1.5 h-px list-none ${inspectorListDividerLineClassName}`} role="presentation" /> : null;
  }
  return (
    <li className={`flex list-none items-center gap-2 px-0 pb-2 pt-3 text-center text-[12px] leading-none ${inspectorListMetaClassName}`}>
      <span aria-hidden="true" className={`h-px min-w-4 flex-1 ${inspectorListDividerLineClassName}`} />
      <span className="shrink-0 text-foreground/45">{heading}</span>
      <span aria-hidden="true" className={`h-px min-w-4 flex-1 ${inspectorListDividerLineClassName}`} />
    </li>
  );
}

export function FlowSection(props: {
  heading?: string | undefined;
  indexOffset: number;
  nodeIds: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  showDivider: boolean;
}) {
  if (props.nodeIds.length === 0) {
    return null;
  }
  return (
    <>
      <FlowSectionHeading heading={props.heading} showDivider={props.showDivider} />
      {props.nodeIds.map((nodeId, index) => (
        <QueueRow
          index={props.indexOffset + index}
          key={nodeId}
          node={props.nodesById[nodeId]!}
          nodeId={nodeId}
          onSelectNode={props.onSelectNode}
        />
      ))}
    </>
  );
}
