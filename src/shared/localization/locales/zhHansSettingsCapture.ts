import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_CAPTURE_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.capture.sectionAria': '全局剪辑设置',
  'settings.capture.sectionTitle': '全局剪辑',
  'settings.capture.permission.title': '选区访问',
  'settings.capture.permission.granted': '运行全局剪辑时，Foliole 可以复制当前选区。',
  'settings.capture.permission.denied': '请在“系统设置 → 隐私与安全性 → 辅助功能”中允许 Foliole。',
  'settings.capture.permission.unavailable': '这台 Mac 当前无法使用选区访问。',
  'settings.capture.permission.notRequired': '这台设备不需要额外的选区权限。',
  'settings.capture.permission.unsupported': '这台设备不支持全局剪辑。',
  'settings.capture.position.title': '完成提示位置',
  'settings.capture.position.description': '选择剪辑完成提示在这台 Mac 上的显示位置。',
  'settings.capture.position.topRight': '右上角',
  'settings.capture.position.bottomRight': '右下角'
};
