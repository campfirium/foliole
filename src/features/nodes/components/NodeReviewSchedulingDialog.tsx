import { useEffect, useState } from 'react';

import { normalizePushQueuePriority } from '../../review/model/unifiedPushQueueRules';
import {
  resolveNodeDesiredRetentionSetting,
  resolveNodePrioritySetting,
  resolveNodeShortTermSetting,
  type ResolvedNodeSetting
} from '../model/nodeReviewSettings';
import type { WorkspaceListNode } from '../model/workspaceListNode';

import { useTranslation, type Translate } from '@/shared/localization/LocalizationProvider';
import {
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  settingsControlValueClassName,
  settingsRangeClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '@/shared/ui';

type ReviewOptionsNode = Pick<WorkspaceListNode,
  'id' | 'kind' | 'parentNodeId' | 'priority' | 'desiredRetention' | 'enableShortTerm'>;

function getScopeLabel(node: ReviewOptionsNode, t: Translate) {
  if (node.kind === 'folder') {
    return t('desktop.nodeReview.scope.folder');
  }
  if (node.kind === 'item') {
    return t('desktop.nodeReview.scope.item');
  }
  return t('desktop.nodeReview.scope.topic');
}

function renderShortTermDescription(t: Translate) {
  return t('desktop.nodeReview.shortTerm.description');
}

function renderPriorityDescription(node: ReviewOptionsNode, t: Translate) {
  return t('desktop.nodeReview.priority.description', { scope: getScopeLabel(node, t) });
}

function ShortTermControl(props: {
  ariaLabel: string;
  onChange: (enableShortTerm: boolean) => void;
  value: boolean;
}) {
  return (
    <SettingsControlSlot>
      <button
        aria-checked={props.value}
        aria-label={props.ariaLabel}
        className={settingsSwitchClassName(props.value)}
        onClick={() => props.onChange(!props.value)}
        role="switch"
        type="button"
      >
        <span className={settingsSwitchKnobClassName(props.value)} />
      </button>
    </SettingsControlSlot>
  );
}

function PriorityControl(props: {
  ariaLabel: string;
  onChange: (priority: number) => void;
  value: number;
}) {
  return (
    <SettingsControlSlot>
      <input
        aria-label={props.ariaLabel}
        className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
        max={9}
        min={0}
        onChange={(event) => props.onChange(Number(event.target.value))}
        step={1}
        type="range"
        value={props.value}
      />
      <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>
        P{props.value}
      </span>
    </SettingsControlSlot>
  );
}

function useNodeReviewSchedulingDraft(args: {
  node: ReviewOptionsNode;
  priority: ResolvedNodeSetting<number>;
  shortTerm: ResolvedNodeSetting<boolean>;
}) {
  const [retentionDraft, setRetentionDraft] = useState<number | null>(args.node.desiredRetention ?? null);
  const [isRetentionDirty, setIsRetentionDirty] = useState(false);
  const [priorityDraft, setPriorityDraft] = useState(args.priority.value);
  const [shortTermDraft, setShortTermDraft] = useState(args.shortTerm.value);
  const [isPriorityDirty, setIsPriorityDirty] = useState(false);
  const [isShortTermDirty, setIsShortTermDirty] = useState(false);

  useEffect(() => {
    setRetentionDraft(args.node.desiredRetention ?? null);
    setIsRetentionDirty(false);
    setPriorityDraft(args.priority.value);
    setShortTermDraft(args.shortTerm.value);
    setIsPriorityDirty(false);
    setIsShortTermDirty(false);
  }, [args.node.id, args.node.desiredRetention, args.priority.value, args.shortTerm.value]);

  return {
    retentionDraft,
    isRetentionDirty,
    setRetentionDraft: (value: number | null) => { setRetentionDraft(value); setIsRetentionDirty(true); },
    isPriorityDirty,
    isShortTermDirty,
    priorityDraft,
    setPriorityDraft: (value: number) => {
      setPriorityDraft(value);
      setIsPriorityDirty(true);
    },
    setShortTermDraft: (value: boolean) => {
      setShortTermDraft(value);
      setIsShortTermDirty(true);
    },
    shortTermDraft
  };
}

type NodeReviewSchedulingDraft = ReturnType<typeof useNodeReviewSchedulingDraft>;

function RetentionRow({ draft, retention, t }: {
  draft: NodeReviewSchedulingDraft;
  retention: ResolvedNodeSetting<number>;
  t: Translate;
}) {
  const inherits = draft.retentionDraft === null;
  const percent = Math.round((draft.retentionDraft ?? retention.value) * 100);
  const label = t('desktop.nodeReview.desiredRetention');
  return (
    <SettingsRow title={inherits ? t('desktop.nodeReview.desiredRetention.inherited', { label }) : label}>
      <SettingsControlSlot>
        {!inherits && (
          <button className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => draft.setRetentionDraft(null)} type="button">
            {t('desktop.nodeReview.desiredRetention.useInherited')}
          </button>
        )}
        <input aria-label={t('desktop.nodeReview.desiredRetention.aria')} aria-valuetext={`${percent}%`}
          className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)} min={1} max={99} step={1}
          onChange={event => draft.setRetentionDraft(event.currentTarget.valueAsNumber / 100)}
          type="range" value={percent} />
        <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>{percent}%</span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function ReviewSchedulingRows(props: {
  draft: NodeReviewSchedulingDraft;
  retention: ResolvedNodeSetting<number>;
  node: ReviewOptionsNode;
  t: Translate;
}) {
  return (
    <SettingsSection ariaLabel={props.t('desktop.nodeReview.optionsPanel')} className="mb-0 pb-5">
      <RetentionRow draft={props.draft} retention={props.retention} t={props.t} />
      <SettingsRow description={renderPriorityDescription(props.node, props.t)} title={props.t('desktop.nodeReview.priority')}>
        <PriorityControl ariaLabel={props.t('desktop.nodeReview.priority.aria')} onChange={props.draft.setPriorityDraft} value={props.draft.priorityDraft} />
      </SettingsRow>
      <SettingsRow description={renderShortTermDescription(props.t)} title={props.t('desktop.nodeReview.shortTerm')}>
        <ShortTermControl ariaLabel={props.t('desktop.nodeReview.shortTerm')} onChange={props.draft.setShortTermDraft} value={props.draft.shortTermDraft} />
      </SettingsRow>
    </SettingsSection>
  );
}

export function NodeReviewSchedulingDialog(props: {
  defaultPriority: number;
  defaultDesiredRetention: number;
  node: ReviewOptionsNode | null;
  nodesById: Record<string, ReviewOptionsNode | undefined>;
  titleQualifier?: string;
  onClose: () => void;
  onDesiredRetentionChange: (nodeId: string, desiredRetention: number | null) => void;
  onPriorityChange: (nodeId: string, priority: number | null) => void;
  onShortTermChange: (nodeId: string, enableShortTerm: boolean | null) => void;
}) {
  const node = props.node;
  if (!node) {
    return null;
  }
  const t = useTranslation();
  const nodeId = node.id;
  const shortTerm = resolveNodeShortTermSetting(nodeId, props.nodesById);
  const retention = resolveNodeDesiredRetentionSetting(nodeId, { ...props.nodesById,
    [nodeId]: { ...node, desiredRetention: null } }, props.defaultDesiredRetention);
  const priority = resolveNodePrioritySetting(nodeId, props.nodesById, normalizePushQueuePriority(props.defaultPriority));
  const draft = useNodeReviewSchedulingDraft({ node, priority, shortTerm });

  function commitAndClose() {
    if (draft.isRetentionDirty) props.onDesiredRetentionChange(nodeId, draft.retentionDraft);
    if (draft.isPriorityDirty) {
      props.onPriorityChange(nodeId, draft.priorityDraft);
    }
    if (draft.isShortTermDirty) {
      props.onShortTermChange(nodeId, draft.shortTermDraft);
    }
    props.onClose();
  }

  return (
    <AppDialog open onOpenChange={(open) => !open && commitAndClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="w-[min(640px,calc(100vw-32px))] p-0">
          <div className="px-5 pb-2 pt-5">
            <AppDialogTitle className="text-base font-semibold">
              {t('desktop.nodeReview.title')}{props.titleQualifier ? ` · ${props.titleQualifier}` : null}
            </AppDialogTitle>
          </div>
          <ReviewSchedulingRows draft={draft} node={node} retention={retention} t={t} />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
