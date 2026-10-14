export const ORIGINAL_DATA_PROTECTION_COPY = {
  en: 'To protect your library, Foliole has stopped this upgrade. Some information in older sync records could not be verified in the current library. Restarting will not restore this information. Please copy the diagnostics and contact support.',
  'zh-Hans': '为保护资料，Foliole 已停止本次升级。旧版同步记录中的部分信息未能在现有资料中得到确认。重新启动不会补齐这些信息，请复制诊断信息并联系支持。'
} as const;

export function isOriginalDataProtectionError(message: string) {
  return /^legacy_sync_original_(?:(?:fact|body|review|relation|parents)_unbacked:|parents_invalid$)/u.test(message);
}
