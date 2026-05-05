import { SettingsPanel } from '../../features/settings/components/SettingsPanel';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';

function buildSettingsPanelProps(props: WorkspaceLayoutProps) {
  return {
    customUiFont: props.customUiFont,
    customInterfaceFont: props.customInterfaceFont,
    customMonospaceFont: props.customMonospaceFont,
    baseColorMode: props.baseColorMode,
    accentColorPreset: props.accentColorPreset,
    uiFontPreset: props.uiFontPreset,
    interfaceFontPreset: props.interfaceFontPreset,
    interfaceFontSize: props.interfaceFontSize,
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
    markdownSyntaxVisibility: props.markdownSyntaxVisibility,
    mouseGestureSettings: props.mouseGestureSettings,
    monospaceFontPreset: props.monospaceFontPreset,
    onClose: props.onCloseSettings,
    onBaseColorModeChange: props.onBaseColorModeChange,
    onAccentColorPresetChange: props.onAccentColorPresetChange,
    onAccentColorPresetReset: props.onAccentColorPresetReset,
    onUiFontPresetChange: props.onUiFontPresetChange,
    onCustomUiFontChange: props.onCustomUiFontChange,
    onCustomInterfaceFontChange: props.onCustomInterfaceFontChange,
    onInterfaceFontPresetChange: props.onInterfaceFontPresetChange,
    onCustomMonospaceFontChange: props.onCustomMonospaceFontChange,
    onInterfaceFontSizeChange: props.onInterfaceFontSizeChange,
    onInterfaceFontSizeReset: props.onInterfaceFontSizeReset,
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
    onMarkdownSyntaxVisibilityChange: props.onMarkdownSyntaxVisibilityChange,
    onMouseGestureActionChange: props.onMouseGestureActionChange,
    onMouseGestureTrailColorChange: props.onMouseGestureTrailColorChange,
    onMouseGestureTrailLineWidthChange: props.onMouseGestureTrailLineWidthChange,
    onMouseGestureTrailOpacityChange: props.onMouseGestureTrailOpacityChange,
    onMouseGestureSegmentThresholdChange: props.onMouseGestureSegmentThresholdChange,
    onMouseGestureTrailPointThresholdChange: props.onMouseGestureTrailPointThresholdChange,
    onMonospaceFontPresetChange: props.onMonospaceFontPresetChange,
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
