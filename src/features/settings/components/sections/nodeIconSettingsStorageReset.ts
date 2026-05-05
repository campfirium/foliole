import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { removeWhitelistedLocalStorageItem } from '../../../../shared/platform/storage';

export function resetNodeIconSettingsStorage() {
  [
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
    APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg,
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimaryLucideIcon,
    APP_SETTINGS_STORAGE_KEYS.nodeIconSecondaryLucideIcon,
    APP_SETTINGS_STORAGE_KEYS.nodeIconPrimaryAppearance,
    APP_SETTINGS_STORAGE_KEYS.nodeIconSecondaryAppearance,
    APP_SETTINGS_STORAGE_KEYS.nodeIconReviewVariantMode,
    APP_SETTINGS_STORAGE_KEYS.nodeIconPendingStrokeStyle,
    APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledStrokeStyle,
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedStrokeStyle,
    APP_SETTINGS_STORAGE_KEYS.nodeIconPendingDashLength,
    APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledDashLength,
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedDashLength,
    APP_SETTINGS_STORAGE_KEYS.nodeIconPendingGapLength,
    APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledGapLength,
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedGapLength,
    APP_SETTINGS_STORAGE_KEYS.nodeIconPendingLineWidth,
    APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledLineWidth,
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedLineWidth,
    APP_SETTINGS_STORAGE_KEYS.nodeIconPendingColor,
    APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledColor,
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedColor,
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeEnabled,
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeOpacity,
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeWholeRow,
    APP_SETTINGS_STORAGE_KEYS.nodeIconPendingTopicAppearance,
    APP_SETTINGS_STORAGE_KEYS.nodeIconPendingItemAppearance,
    APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledTopicAppearance,
    APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledItemAppearance,
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedTopicAppearance,
    APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedItemAppearance
  ].forEach(removeWhitelistedLocalStorageItem);
}
