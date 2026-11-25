import { Check } from 'lucide-react';

import {
  resolveNodePrioritySetting,
  resolveUnenforcedNodePriority,
  type ResolvedNodePriority
} from '../../features/nodes/model/nodeReviewSettings';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { PushQueuePriority } from '../../features/review/model/unifiedPushQueueRules';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger
} from '../../shared/ui';

const PRIORITY_TRIGGER_CLASS =
  'inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium leading-none text-foreground/45 transition-colors hover:border-border/60 hover:bg-foreground/[0.04] hover:text-foreground/70 data-[state=open]:border-border/70 data-[state=open]:bg-foreground/[0.05] data-[state=open]:text-foreground/75 disabled:cursor-default disabled:opacity-45';

function describePrioritySource(source: 'explicit' | 'inherited' | 'default', value: number, shortcutLabel?: string) {
  const suffix = shortcutLabel ? ` Shortcut ${shortcutLabel}.` : '';
  if (source === 'explicit') {
    return `Priority P${value} set on this node.${suffix}`;
  }
  if (source === 'inherited') {
    return `Priority P${value} inherited from an ancestor.${suffix}`;
  }
  return `Priority P${value} from the default fallback.${suffix}`;
}

function renderPriorityOptionLabel(priority: number, isCurrent: boolean) {
  return (
    <>
      <span>{`P${priority}`}</span>
      {isCurrent ? <Check aria-hidden="true" className="size-3.5 text-foreground/65" strokeWidth={2.2} /> : null}
    </>
  );
}

function EnforcedPriorityNote({ ownerTitle, value }: { ownerTitle: string; value: number }) {
  const t = useTranslation();
  return (
    <div className="mt-1 border-t border-border px-2 py-1.5 text-xs text-foreground/70">
      <div>{t('desktop.nodeReview.priority.inactive')}</div>
      <div className="break-words">{`P${value} · ${ownerTitle} `}{t('desktop.diagnostics.scheduling.prioritySource.enforced')}</div>
    </div>
  );
}

function describeTrigger(priority: ResolvedNodePriority, ownerTitle: string, shortcutLabel?: string) {
  if (!priority.enforced) return describePrioritySource(priority.source, priority.value, shortcutLabel);
  const suffix = shortcutLabel ? ` Shortcut ${shortcutLabel}.` : '';
  return `Priority P${priority.value} enforced by ${ownerTitle}.${suffix}`;
}

interface DocumentPriorityControlProps {
  activeNodeId: string | null;
  defaultPriority: PushQueuePriority;
  editableNodeId: string | null;
  nodesById: Record<string, Node>;
  onPriorityChange: (nodeId: string, priority: number | null) => void;
  shortcutLabel?: string;
}

function priorityMenuItemClassName(isCurrent: boolean) {
  return [
    'min-h-7 justify-between gap-3 rounded-sm px-2 text-sm font-medium',
    isCurrent ? 'bg-foreground/[0.05] text-foreground' : 'text-foreground/78'
  ].join(' ');
}

function PriorityTrigger(props: {
  buttonLabel: string;
  isEditable: boolean;
  value: number;
}) {
  return (
    <AppDropdownMenuTrigger asChild>
      <button
        aria-label={props.buttonLabel}
        className={PRIORITY_TRIGGER_CLASS}
        disabled={!props.isEditable}
        title={props.buttonLabel}
        type="button"
      >
        {`P${props.value}`}
      </button>
    </AppDropdownMenuTrigger>
  );
}

export function DocumentPriorityControl({
  activeNodeId,
  defaultPriority,
  editableNodeId,
  nodesById,
  onPriorityChange,
  shortcutLabel
}: DocumentPriorityControlProps) {
  if (!activeNodeId) {
    return null;
  }

  const node = nodesById[activeNodeId];
  if (!node) {
    return null;
  }

  const resolvedPriority = resolveNodePrioritySetting(activeNodeId, nodesById, defaultPriority);
  const enforced = resolvedPriority.enforced === true;
  const selected = enforced ? resolveUnenforcedNodePriority(activeNodeId, nodesById, defaultPriority).value : resolvedPriority.value;
  const ownerTitle = (resolvedPriority.ownerNodeId && nodesById[resolvedPriority.ownerNodeId]?.title) || '';
  const isEditable = editableNodeId === activeNodeId;
  const buttonLabel = describeTrigger(resolvedPriority, ownerTitle, shortcutLabel);

  return (
    <AppDropdownMenu>
      <PriorityTrigger buttonLabel={buttonLabel} isEditable={isEditable} value={resolvedPriority.value} />
      <AppDropdownMenuContent align="end" className={enforced ? 'w-44 min-w-0' : 'w-24 min-w-0'} sideOffset={6}>
        {Array.from({ length: 10 }, (_, priority) => (
          <AppDropdownMenuItem
            className={`${priorityMenuItemClassName(selected === priority)}${enforced ? ' opacity-[0.46]' : ''}`}
            key={priority}
            disabled={!isEditable}
            onSelect={() => onPriorityChange(activeNodeId, priority)}
            title={priority === 0 ? 'P0 comes first and is not delayed by priority scaling.' : undefined}
          >
            {renderPriorityOptionLabel(priority, selected === priority)}
          </AppDropdownMenuItem>
        ))}
        {enforced ? <EnforcedPriorityNote ownerTitle={ownerTitle} value={resolvedPriority.value} /> : null}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
