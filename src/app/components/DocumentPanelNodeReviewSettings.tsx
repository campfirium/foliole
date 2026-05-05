import {
  resolveNodeDesiredRetentionSetting,
  resolveNodePrioritySetting,
  type ResolvedNodeSetting
} from '../../features/nodes/model/nodeReviewSettings';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';

interface DocumentPanelNodeReviewSettingsProps {
  activeNodeId: string | null;
  editableNodeId: string | null;
  nodesById: Record<string, Node>;
  onDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => void;
  onPriorityChange: (nodeId: string, priority: number | null) => void;
  reviewSchedulerSettings: ReviewSchedulerSettings;
}

const DESIRED_RETENTION_OPTIONS = Array.from({ length: 99 }, (_, index) => {
  const value = Number(((index + 1) / 100).toFixed(2));
  return { label: value.toFixed(2), value: value.toFixed(2) };
});

const PRIORITY_OPTIONS = Array.from({ length: 10 }, (_, index) => ({
  label: index === 0 ? 'P0 · Absolute privilege' : `P${index}`,
  value: String(index)
}));

function getOwnerLabel(setting: ResolvedNodeSetting<number>, nodesById: Record<string, Node>) {
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
  return `Default · ${valueLabel} from review settings`;
}

function renderPriorityState(setting: ResolvedNodeSetting<number>, nodesById: Record<string, Node>) {
  const valueLabel = `P${setting.value}`;
  if (setting.source === 'explicit') {
    return `Explicit · ${valueLabel} on this node`;
  }
  if (setting.source === 'inherited') {
    return `Inherited · ${valueLabel} from ${getOwnerLabel(setting, nodesById) ?? 'ancestor'}`;
  }
  return `Default · ${valueLabel} from push queue fallback`;
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
      <select aria-label="Node desired retention" className="h-9 rounded-md border border-border bg-bg-elevated px-3 text-sm text-foreground" disabled={!isEditable} onChange={(event) => onDesiredRetentionChange(activeNodeId, event.target.value === 'inherit' ? null : Number(event.target.value))} value={node.desiredRetention == null ? 'inherit' : node.desiredRetention.toFixed(2)}>
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
      <select aria-label="Node queue priority" className="h-9 rounded-md border border-border bg-bg-elevated px-3 text-sm text-foreground" disabled={!isEditable} onChange={(event) => onPriorityChange(activeNodeId, event.target.value === 'inherit' ? null : Number(event.target.value))} value={node.priority == null ? 'inherit' : String(node.priority)}>
        <option value="inherit">Inherit resolved value</option>
        {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span className="text-xs text-foreground/70">{renderPriorityState(setting, nodesById)}</span>
    </label>
  );
}

export function DocumentPanelNodeReviewSettings({
  activeNodeId,
  editableNodeId,
  nodesById,
  onDesiredRetentionChange,
  onPriorityChange,
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
  const isEditable = editableNodeId === activeNodeId;

  return (
    <section aria-label="Node review settings" className="rounded-xl border border-border bg-bg-panel p-4">
      <div className="flex w-full flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">Review scheduling</h3>
          <p className="text-xs text-foreground/70">
            `desired retention` is the memory target. `priority` is the queue scheduler. `P0` is absolute privilege and, if due, always surfaces first.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <DesiredRetentionField activeNodeId={activeNodeId} isEditable={isEditable} node={node} nodesById={nodesById} onDesiredRetentionChange={onDesiredRetentionChange} setting={desiredRetention} />
          <PriorityField activeNodeId={activeNodeId} isEditable={isEditable} node={node} nodesById={nodesById} onPriorityChange={onPriorityChange} setting={priority} />
        </div>
      </div>
    </section>
  );
}
