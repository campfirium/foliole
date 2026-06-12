import {
  resolveNodeDesiredRetentionSetting,
  resolveNodePrioritySetting,
  resolveNodeShortTermSetting,
  type ResolvedNodeSetting
} from '../../features/nodes/model/nodeReviewSettings';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { appSurfaceControlClassName, InspectorSection } from '../../shared/ui';

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
  value: String(index)
}));

type NodeReviewTranslate = ReturnType<typeof useTranslation>;

function getOwnerLabel(setting: ResolvedNodeSetting<unknown>, nodesById: Record<string, Node>) {
  if (!setting.ownerNodeId) {
    return null;
  }
  return nodesById[setting.ownerNodeId]?.title ?? setting.ownerNodeId;
}

function renderDesiredRetentionState(setting: ResolvedNodeSetting<number>, nodesById: Record<string, Node>, t: NodeReviewTranslate) {
  const valueLabel = setting.value.toFixed(2);
  if (setting.source === 'explicit') {
    return t('desktop.nodeReview.explicit', { value: valueLabel });
  }
  if (setting.source === 'inherited') {
    return t('desktop.nodeReview.inherited', { owner: getOwnerLabel(setting, nodesById) ?? t('desktop.nodeReview.ancestor'), value: valueLabel });
  }
  return t('desktop.nodeReview.usingReviewSettings', { value: valueLabel });
}

function renderPriorityState(setting: ResolvedNodeSetting<number>, nodesById: Record<string, Node>, t: NodeReviewTranslate) {
  const valueLabel = `P${setting.value}`;
  if (setting.source === 'explicit') {
    return t('desktop.nodeReview.explicit', { value: valueLabel });
  }
  if (setting.source === 'inherited') {
    return t('desktop.nodeReview.inherited', { owner: getOwnerLabel(setting, nodesById) ?? t('desktop.nodeReview.ancestor'), value: valueLabel });
  }
  return t('desktop.nodeReview.usingQueueFallback', { value: valueLabel });
}

function renderShortTermState(setting: ResolvedNodeSetting<boolean>, nodesById: Record<string, Node>, t: NodeReviewTranslate) {
  const valueLabel = setting.value ? t('desktop.nodeReview.enabled') : t('desktop.nodeReview.disabled');
  if (setting.source === 'explicit') {
    return t('desktop.nodeReview.explicit', { value: valueLabel });
  }
  if (setting.source === 'inherited') {
    return t('desktop.nodeReview.inherited', { owner: getOwnerLabel(setting, nodesById) ?? t('desktop.nodeReview.ancestor'), value: valueLabel });
  }
  return t('desktop.nodeReview.noLocalShortTerm');
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
  const t = useTranslation();
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-foreground">
      <span className="font-medium">{t('desktop.nodeReview.desiredRetention')}</span>
      <select aria-label={t('desktop.nodeReview.desiredRetention.aria')} className={appSurfaceControlClassName()} disabled={!isEditable} onChange={(event) => onDesiredRetentionChange(activeNodeId, event.target.value === 'inherit' ? null : Number(event.target.value))} value={node.desiredRetention == null ? 'inherit' : node.desiredRetention.toFixed(2)}>
        <option value="inherit">{t('desktop.nodeReview.inherit')}</option>
        {DESIRED_RETENTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span className="text-xs text-foreground/70">{renderDesiredRetentionState(setting, nodesById, t)}</span>
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
  const t = useTranslation();
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-foreground">
      <span className="font-medium">{t('desktop.nodeReview.priority')}</span>
      <select aria-label={t('desktop.nodeReview.priority.aria')} className={appSurfaceControlClassName()} disabled={!isEditable} onChange={(event) => onPriorityChange(activeNodeId, event.target.value === 'inherit' ? null : Number(event.target.value))} value={node.priority == null ? 'inherit' : String(node.priority)}>
        <option value="inherit">{t('desktop.nodeReview.inherit')}</option>
        {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.value === '0' ? t('desktop.nodeReview.priority.p0') : `P${option.value}`}</option>)}
      </select>
      <span className="text-xs text-foreground/70">{renderPriorityState(setting, nodesById, t)}</span>
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
  const t = useTranslation();
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-foreground">
      <span className="font-medium">{t('desktop.nodeReview.shortTerm')}</span>
      <select aria-label={t('desktop.nodeReview.shortTerm')} className={appSurfaceControlClassName()} disabled={!isEditable} onChange={(event) => {
        const value = event.target.value;
        onShortTermChange(activeNodeId, value === 'inherit' ? null : value === 'enabled');
      }} value={node.enableShortTerm == null ? 'inherit' : node.enableShortTerm ? 'enabled' : 'disabled'}>
        <option value="inherit">{t('desktop.nodeReview.inherit')}</option>
        <option value="enabled">{t('desktop.nodeReview.enabled')}</option>
        <option value="disabled">{t('desktop.nodeReview.disabled')}</option>
      </select>
      <span className="text-xs text-foreground/70">{renderShortTermState(setting, nodesById, t)}</span>
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
  const t = useTranslation();
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
      ariaLabel={t('desktop.nodeReview.aria')}
      description={t('desktop.nodeReview.description')}
      title={t('desktop.nodeReview.title')}
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
