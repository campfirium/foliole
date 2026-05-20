import { useEffect, useState } from 'react';

import {
  resolveNodePrioritySetting,
  resolveNodeShortTermSetting,
  type ResolvedNodeSetting
} from '../model/nodeReviewSettings';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../model/workspaceListNode';

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

function getScopeLabel(node: WorkspaceListNode) {
  if (node.kind === 'folder') {
    return 'Folder';
  }
  if (node.kind === 'item') {
    return 'Item';
  }
  return 'Topic';
}

function renderShortTermDescription() {
  return 'Add extra reviews for new Items. Experimental FSRS setting; enable only for material that needs upfront practice.';
}

function renderPriorityDescription(node: WorkspaceListNode) {
  const scope = getScopeLabel(node);
  return `Affects Review order for Items in this ${scope}. P0 comes first and is not delayed by priority scaling.`;
}

function ShortTermControl(props: {
  onChange: (enableShortTerm: boolean) => void;
  value: boolean;
}) {
  return (
    <SettingsControlSlot>
      <button
        aria-checked={props.value}
        aria-label="Short-term learning steps"
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
  onChange: (priority: number) => void;
  value: number;
}) {
  return (
    <SettingsControlSlot>
      <input
        aria-label="Review queue priority"
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
  node: WorkspaceListNode;
  priority: ResolvedNodeSetting<number>;
  shortTerm: ResolvedNodeSetting<boolean>;
}) {
  const [priorityDraft, setPriorityDraft] = useState(args.priority.value);
  const [shortTermDraft, setShortTermDraft] = useState(args.shortTerm.value);
  const [isPriorityDirty, setIsPriorityDirty] = useState(false);
  const [isShortTermDirty, setIsShortTermDirty] = useState(false);

  useEffect(() => {
    setPriorityDraft(args.priority.value);
    setShortTermDraft(args.shortTerm.value);
    setIsPriorityDirty(false);
    setIsShortTermDirty(false);
  }, [args.node.id, args.priority.value, args.shortTerm.value]);

  return {
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

export function NodeReviewSchedulingDialog(props: {
  defaultPriority: number;
  node: WorkspaceListNode | null;
  nodesById: WorkspaceListNodesById;
  onClose: () => void;
  onPriorityChange: (nodeId: string, priority: number | null) => void;
  onShortTermChange: (nodeId: string, enableShortTerm: boolean | null) => void;
}) {
  const node = props.node;
  if (!node) {
    return null;
  }
  const shortTerm = resolveNodeShortTermSetting(node.id, props.nodesById);
  const priority = resolveNodePrioritySetting(node.id, props.nodesById, props.defaultPriority);
  const draft = useNodeReviewSchedulingDraft({ node, priority, shortTerm });

  function commitAndClose() {
    if (draft.isPriorityDirty) {
      props.onPriorityChange(node.id, draft.priorityDraft);
    }
    if (draft.isShortTermDirty) {
      props.onShortTermChange(node.id, draft.shortTermDraft);
    }
    props.onClose();
  }

  return (
    <AppDialog open onOpenChange={(open) => !open && commitAndClose()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="w-[min(640px,calc(100vw-32px))] p-0">
          <div className="px-5 pb-2 pt-5">
            <AppDialogTitle className="text-base font-semibold">Review options</AppDialogTitle>
          </div>
          <SettingsSection ariaLabel="Review options panel" className="mb-0 pb-5">
            <SettingsRow
              description={renderPriorityDescription(node)}
              title="Priority"
            >
              <PriorityControl
                onChange={draft.setPriorityDraft}
                value={draft.priorityDraft}
              />
            </SettingsRow>
            <SettingsRow
              description={renderShortTermDescription()}
              title="Short-term learning steps"
            >
              <ShortTermControl
                onChange={draft.setShortTermDraft}
                value={draft.shortTermDraft}
              />
            </SettingsRow>
          </SettingsSection>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
