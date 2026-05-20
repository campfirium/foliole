import {
  resolveNodeDesiredRetentionSetting,
  resolveNodePrioritySetting,
  resolveNodeShortTermSetting,
  type ResolvedNodeSetting
} from '../../features/nodes/model/nodeReviewSettings';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { InspectorSection } from '../../shared/ui';

interface DocumentPanelNodeReviewSettingsProps {
  activeNodeId: string | null;
  editableNodeId: string | null;
  nodesById: Record<string, Node>;
  onDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => void;
  onPriorityChange: (nodeId: string, priority: number | null) => void;
  onShortTermChange: (nodeId: string, enableShortTerm: boolean | null) => void;
  reviewSchedulerSettings: ReviewSchedulerSettings;
}

const DESIRED_RETENTION_OPTIONS = Array.from({ length: 99 }, (_, index) => {
  const value = Number(((index + 1) / 100).toFixed(2));
  return { label: value.toFixed(2), value: value.toFixed(2) };
});

const PRIORITY_OPTIONS = Array.from({ length: 10 }, (_, index) => ({
  label: index === 0 ? 'P0 · First, no delay scaling' : `P${index}`,
  value: String(index)
}));

function getOwnerLabel(setting: ResolvedNodeSetting<unknown>, nodesById: Record<string, Node>) {
  if (!setting.ownerNodeId) {
    return null;
  }
  return nodesById[setting.ownerNodeId]?.title ?? setting.ownerNodeId;
}

function renderDesiredRetentionState(setting: ResolvedNodeSetting<number>, nodesById: Record<string, Node>) {
  const valueLabel = setting.value.toFixed(2);
  if (setting.source === 'explicit') {
    return `Explicit · ${valueLabel} on this node`;
  }
  if (setting.source === 'inherited') {
    return `Inherited · ${valueLabel} from ${getOwnerLabel(setting, nodesById) ?? 'ancestor'}`;
  }
  return `Using review settings: ${valueLabel}`;
}

function renderPriorityState(setting: ResolvedNodeSetting<number>, nodesById: Record<string, Node>) {
  const valueLabel = `P${setting.value}`;
  if (setting.source === 'explicit') {
    return `Explicit · ${valueLabel} on this node`;
  }
  if (setting.source === 'inherited') {
    return `Inherited · ${valueLabel} from ${getOwnerLabel(setting, nodesById) ?? 'ancestor'}`;
  }
  return `Using queue fallback: ${valueLabel}`;
}

function renderShortTermState(setting: ResolvedNodeSetting<boolean>, nodesById: Record<string, Node>) {
  const valueLabel = setting.value ? 'Enabled' : 'Disabled';
  if (setting.source === 'explicit') {
    return `Explicit · ${valueLabel} on this node`;
  }
  if (setting.source === 'inherited') {
    return `Inherited · ${valueLabel} from ${getOwnerLabel(setting, nodesById) ?? 'ancestor'}`;
  }
  return 'No local short-term setting';
}

function DesiredRetentionField({
  activeNodeId,
  isEditable,
  node,
  nodesById,
  onDesiredRetentionChange,
  setting
}: {
  activeNodeId: string;
  isEditable: boolean;
  node: Node;
  nodesById: Record<string, Node>;
  onDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => void;
  setting: ResolvedNodeSetting<number>;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-foreground">
      <span className="font-medium">Desired retention</span>
      <select aria-label="Review desired retention" className="h-9 rounded-md border border-border bg-bg-elevated px-3 text-sm text-foreground" disabled={!isEditable} onChange={(event) => onDesiredRetentionChange(activeNodeId, event.target.value === 'inherit' ? null : Number(event.target.value))} value={node.desiredRetention == null ? 'inherit' : node.desiredRetention.toFixed(2)}>
        <option value="inherit">Inherit resolved value</option>
        {DESIRED_RETENTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span className="text-xs text-foreground/70">{renderDesiredRetentionState(setting, nodesById)}</span>
    </label>
  );
}

function PriorityField({
  activeNodeId,
  isEditable,
  node,
  nodesById,
  onPriorityChange,
  setting
}: {
  activeNodeId: string;
  isEditable: boolean;
  node: Node;
  nodesById: Record<string, Node>;
  onPriorityChange: (nodeId: string, priority: number | null) => void;
  setting: ResolvedNodeSetting<number>;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-foreground">
      <span className="font-medium">Priority</span>
      <select aria-label="Review queue priority" className="h-9 rounded-md border border-border bg-bg-elevated px-3 text-sm text-foreground" disabled={!isEditable} onChange={(event) => onPriorityChange(activeNodeId, event.target.value === 'inherit' ? null : Number(event.target.value))} value={node.priority == null ? 'inherit' : String(node.priority)}>
        <option value="inherit">Inherit resolved value</option>
        {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span className="text-xs text-foreground/70">{renderPriorityState(setting, nodesById)}</span>
    </label>
  );
}

function ShortTermField({
  activeNodeId,
  isEditable,
  node,
  nodesById,
  onShortTermChange,
  setting
}: {
  activeNodeId: string;
  isEditable: boolean;
  node: Node;
  nodesById: Record<string, Node>;
  onShortTermChange: (nodeId: string, enableShortTerm: boolean | null) => void;
  setting: ResolvedNodeSetting<boolean>;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-foreground">
      <span className="font-medium">Short-term learning steps</span>
      <select aria-label="Short-term learning steps" className="h-9 rounded-md border border-border bg-bg-elevated px-3 text-sm text-foreground" disabled={!isEditable} onChange={(event) => {
        const value = event.target.value;
        onShortTermChange(activeNodeId, value === 'inherit' ? null : value === 'enabled');
      }} value={node.enableShortTerm == null ? 'inherit' : node.enableShortTerm ? 'enabled' : 'disabled'}>
        <option value="inherit">Inherit resolved value</option>
        <option value="enabled">Enabled</option>
        <option value="disabled">Disabled</option>
      </select>
      <span className="text-xs text-foreground/70">{renderShortTermState(setting, nodesById)}</span>
    </label>
  );
}

function ReviewSchedulingFields(args: {
  activeNodeId: string;
  isEditable: boolean;
  node: Node;
  nodesById: Record<string, Node>;
  onDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => void;
  onPriorityChange: (nodeId: string, priority: number | null) => void;
  onShortTermChange: (nodeId: string, enableShortTerm: boolean | null) => void;
  desiredRetention: ResolvedNodeSetting<number>;
  priority: ResolvedNodeSetting<number>;
  shortTerm: ResolvedNodeSetting<boolean>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ShortTermField {...args} setting={args.shortTerm} />
      <DesiredRetentionField {...args} setting={args.desiredRetention} />
      <PriorityField {...args} setting={args.priority} />
    </div>
  );
}

export function DocumentPanelNodeReviewSettings({
  activeNodeId,
  editableNodeId,
  nodesById,
  onDesiredRetentionChange,
  onPriorityChange,
  onShortTermChange,
  reviewSchedulerSettings
}: DocumentPanelNodeReviewSettingsProps) {
  if (!activeNodeId) {
    return null;
  }
  const node = nodesById[activeNodeId];
  if (!node) {
    return null;
  }

  const desiredRetention = resolveNodeDesiredRetentionSetting(
    activeNodeId,
    nodesById,
    reviewSchedulerSettings.desiredRetention
  );
  const priority = resolveNodePrioritySetting(
    activeNodeId,
    nodesById,
    reviewSchedulerSettings.pushQueue.defaultPriority
  );
  const shortTerm = resolveNodeShortTermSetting(activeNodeId, nodesById);
  const isEditable = editableNodeId === activeNodeId;

  return (
    <InspectorSection
      ariaLabel="Node review settings"
      description="`desired retention` is the memory target. `priority` affects Review order; `P0` comes first and is not delayed by priority scaling."
      title="Review options"
    >
      <ReviewSchedulingFields
        activeNodeId={activeNodeId}
        desiredRetention={desiredRetention}
        isEditable={isEditable}
        node={node}
        nodesById={nodesById}
        onDesiredRetentionChange={onDesiredRetentionChange}
        onPriorityChange={onPriorityChange}
        onShortTermChange={onShortTermChange}
        priority={priority}
        shortTerm={shortTerm}
      />
    </InspectorSection>
  );
}
