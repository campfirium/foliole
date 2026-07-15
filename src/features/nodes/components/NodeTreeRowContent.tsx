import type { ReactNode } from 'react';

import { definedProps } from '../../../shared/lib/definedProps';

import { NodeTreeRowIcon } from './NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from './NodeTreeRowIconModel';
import { renderNodeLabel } from './NodeTreeRowParts';
import type { useRenameState } from './NodeTreeRowRename';
import { resolveNodeRowContentClassName } from './NodeTreeRowStyle';

function renderTrailingContent(content: ReactNode) {
  return content ? <span className="flex-none">{content}</span> : null;
}

function renderLabelCluster(props: { label: string; labelTooltipText?: string; rename: ReturnType<typeof useRenameState>; trailingLabelContent?: ReactNode }) {
  if (!props.trailingLabelContent) return renderNodeLabel(props.label, props.rename, undefined, props.labelTooltipText);
  return (
    <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
      {renderNodeLabel(props.label, props.rename, 'node-tree-row-text block min-w-0 truncate', props.labelTooltipText)}
      {renderTrailingContent(props.trailingLabelContent)}
    </span>
  );
}

function renderRowCount(descendantCount: number) {
  return descendantCount > 0 ? (
    <span aria-hidden="true" className="node-tree-row-text ml-auto flex-none tabular-nums text-foreground/48 [font-size:var(--navigation-meta-font-size)] [line-height:var(--navigation-meta-line-height)]">
      {descendantCount}
    </span>
  ) : null;
}

export function renderNodeTreeRowContent(props: {
  descendantCount: number;
  isMuted: boolean;
  label: string;
  labelTooltipText?: string;
  mutedOpacity: number;
  nodeIconKind: NodeTreeRowIconKind;
  nodeIconState: NodeTreeRowIconState;
  secondaryLabel?: ReactNode;
  trailingLabelContent?: ReactNode;
  showIcon: boolean;
  rename: ReturnType<typeof useRenameState>;
}) {
  return (
    <span className={resolveNodeRowContentClassName()}>
      <span className="flex min-w-0 w-full items-center gap-[0.3125rem] overflow-hidden [font-size:var(--navigation-title-font-size)] [line-height:var(--navigation-title-line-height)]">
        {props.showIcon ? <NodeTreeRowIcon kind={props.nodeIconKind} state={props.nodeIconState} /> : null}
        {renderLabelCluster({ label: props.label, rename: props.rename, ...definedProps({ labelTooltipText: props.labelTooltipText, trailingLabelContent: props.trailingLabelContent }) })}
        {renderRowCount(props.descendantCount)}
      </span>
      {props.secondaryLabel ? (
        <span className="node-tree-row-text min-w-0 truncate text-foreground/55 [font-size:var(--navigation-meta-font-size)] [line-height:var(--navigation-meta-line-height)]">{props.secondaryLabel}</span>
      ) : null}
    </span>
  );
}
