import { useEffect, useState } from 'react';

import { normalizePushQueuePriority } from '../../review/model/unifiedPushQueueRules';
import {
  resolveNodeDesiredRetentionSetting,
  resolveNodePrioritySetting,
  resolveNodeShortTermSetting,
  resolveUnenforcedNodePriority,
  type ResolvedNodeSetting
} from '../model/nodeReviewSettings';
import type { WorkspaceListNode } from '../model/workspaceListNode';

import { DesktopPrioritySlider, type EnforcedPriorityDisplay } from './DesktopPrioritySlider';
import { ReviewRetentionRow } from './ReviewRetentionRow';

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
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  settingsControlValueClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '@/shared/ui';

type ReviewOptionsNode = Pick<WorkspaceListNode,
  'id' | 'kind' | 'parentNodeId' | 'title' | 'priority' | 'enforcePriority' | 'desiredRetention' | 'enableShortTerm'>;

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
  const [enforceDraft, setEnforceDraft] = useState(args.node.enforcePriority === true);

  useEffect(() => {
    setRetentionDraft(args.node.desiredRetention ?? null);
    setIsRetentionDirty(false);
    setPriorityDraft(args.priority.value);
    setShortTermDraft(args.shortTerm.value);
    setIsPriorityDirty(false);
    setIsShortTermDirty(false);
    setEnforceDraft(args.node.enforcePriority === true);
  }, [args.node.id, args.node.desiredRetention, args.node.enforcePriority, args.priority.value, args.shortTerm.value]);

  return {
    retentionDraft,
    enforceDraft,
    setEnforceDraft,
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

function ReviewSchedulingRows(props: {
  draft: NodeReviewSchedulingDraft;
  retention: ResolvedNodeSetting<number>;
  node: ReviewOptionsNode;
  coveredPriority: EnforcedPriorityDisplay | undefined;
  t: Translate;
}) {
  const { draft, t } = props;
  const enforced = draft.enforceDraft ? undefined : props.coveredPriority;
  const priorityLabel = t('desktop.nodeReview.priority');
  return (
    <SettingsSection ariaLabel={t('desktop.nodeReview.optionsPanel')} className="mb-0 pb-5">
      <ReviewRetentionRow own={draft.retentionDraft} inherited={props.retention.value} onChange={draft.setRetentionDraft} />
      <SettingsRow description={enforced ? t(props.node.kind === 'topic'
          ? 'desktop.nodeReview.priority.forcedDescription' : 'desktop.nodeReview.priority.forcedDescriptionMaterial')
          : renderPriorityDescription(props.node, t)}
        title={enforced ? `${priorityLabel} ${t('desktop.nodeReview.priority.forcedLabel')}` : priorityLabel}>
        <SettingsControlSlot>
          <div className="w-[min(9rem,32vw)] [--priority-interactive:rgb(var(--role-accent-rgb))]">
            <DesktopPrioritySlider ariaLabel={t('desktop.nodeReview.priority.aria')} enforced={enforced}
              onChange={draft.setPriorityDraft} value={draft.priorityDraft} />
          </div>
          <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME + (enforced ? ' text-foreground/44' : ''))}>
            {enforced && props.node.priority == null && !draft.isPriorityDirty ? '—' : `P${draft.priorityDraft}`}
          </span>
        </SettingsControlSlot>
      </SettingsRow>
      {props.node.kind === 'folder' && (
        <SettingsRow title={props.t('desktop.nodeReview.priority.enforce')}
          description={props.t('desktop.nodeReview.priority.enforce.description')}>
          <ShortTermControl ariaLabel={props.t('desktop.nodeReview.priority.enforce')}
            onChange={props.draft.setEnforceDraft} value={props.draft.enforceDraft} />
        </SettingsRow>
      )}
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
  onPriorityChange: (nodeId: string, priority: number | null, enforcePriority?: boolean) => void;
  onShortTermChange: (nodeId: string, enableShortTerm: boolean | null) => void;
}) {
  const node = props.node;
  if (!node) {
    return null;
  }
  const t = useTranslation();
  const nodeId = node.id;
  const enforcePriority = node.enforcePriority === true;
  const shortTerm = resolveNodeShortTermSetting(nodeId, props.nodesById);
  const retention = resolveNodeDesiredRetentionSetting(nodeId, { ...props.nodesById,
    [nodeId]: { ...node, desiredRetention: null } }, props.defaultDesiredRetention);
  const fallback = normalizePushQueuePriority(props.defaultPriority);
  const priority = resolveUnenforcedNodePriority(nodeId, props.nodesById, fallback);
  const resolved = resolveNodePrioritySetting(nodeId, props.nodesById, fallback);
  const owner = resolved.enforced && resolved.ownerNodeId ? props.nodesById[resolved.ownerNodeId] : undefined;
  const coveredPriority = resolved.enforced
    ? { value: resolved.value, ...(owner ? { owner: owner.title } : {}) }
    : undefined;
  const draft = useNodeReviewSchedulingDraft({ node, priority, shortTerm });

  function commitAndClose() {
    if (draft.isRetentionDirty) props.onDesiredRetentionChange(nodeId, draft.retentionDraft);
    if (draft.enforceDraft !== enforcePriority) {
      props.onPriorityChange(nodeId, draft.priorityDraft, draft.enforceDraft);
    } else if (draft.isPriorityDirty) {
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
          <ReviewSchedulingRows draft={draft} node={node} retention={retention} t={t}
            coveredPriority={coveredPriority} />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
