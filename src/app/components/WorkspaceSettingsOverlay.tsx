import { SettingsPanel } from '../../features/settings/components/SettingsPanel';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';

function buildSettingsPanelProps(props: WorkspaceLayoutProps) {
  return {
    desiredRetention: props.reviewSchedulerSettings.desiredRetention,
    maximumIntervalDays: props.reviewSchedulerSettings.maximumIntervalDays,
    enableFuzz: props.reviewSchedulerSettings.enableFuzz,
    enableShortTerm: props.reviewSchedulerSettings.enableShortTerm,
    defaultPriority: props.reviewSchedulerSettings.pushQueue.defaultPriority,
    priorityRatio: props.reviewSchedulerSettings.pushQueue.priorityRatio,
    queueMixRatioReading: props.reviewSchedulerSettings.pushQueue.queueMixRatio.reading,
    queueMixRatioFsrs: props.reviewSchedulerSettings.pushQueue.queueMixRatio.fsrs,
    readingInitialIntervalMs: props.reviewSchedulerSettings.pushQueue.readingInitialIntervalMs,
    readingIntervalGrowthFactorMin: props.reviewSchedulerSettings.pushQueue.readingIntervalGrowthFactorRange.min,
    readingIntervalGrowthFactorMax: props.reviewSchedulerSettings.pushQueue.readingIntervalGrowthFactorRange.max,
    hotkeyItems: props.hotkeyItems,
    onClose: props.onCloseSettings,
    onDesiredRetentionChange: props.onDesiredRetentionChange,
    onDefaultPriorityChange: props.onDefaultPriorityChange,
    onMaximumIntervalDaysChange: props.onMaximumIntervalDaysChange,
    onEnableFuzzChange: props.onEnableFuzzChange,
    onEnableShortTermChange: props.onEnableShortTermChange,
    onPriorityRatioChange: props.onPriorityRatioChange,
    onQueueMixRatioReadingChange: props.onQueueMixRatioReadingChange,
    onQueueMixRatioFsrsChange: props.onQueueMixRatioFsrsChange,
    onReadingInitialIntervalDaysChange: props.onReadingInitialIntervalDaysChange,
    onReadingIntervalGrowthFactorMinChange: props.onReadingIntervalGrowthFactorMinChange,
    onReadingIntervalGrowthFactorMaxChange: props.onReadingIntervalGrowthFactorMaxChange,
    onHotkeyUpdate: props.onHotkeyUpdate,
    onHotkeyReset: props.onHotkeyReset,
    onHotkeyResetAll: props.onHotkeyResetAll
  };
}

export function WorkspaceSettingsOverlay({ props }: { props: WorkspaceLayoutProps }) {
  if (!props.isSettingsOpen) {
    return null;
  }

  return <SettingsPanel {...buildSettingsPanelProps(props)} />;
}
