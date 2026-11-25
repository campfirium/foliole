import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_CAPTURE_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.capture.sectionAria': '全局剪辑设置',
  'settings.capture.sectionTitle': '全局剪辑',
  'settings.capture.sectionDescription': '快速捕获任意窗口中的选中文本、即时想法或剪贴板内容，一键存入收件箱。',
  'settings.capture.searchDescription': '查看全局剪辑的相关选项。',
  'settings.capture.searchTerms': '全局捕捉|全局捕获|全局摘录|剪贴板剪辑|划词剪辑',
  'settings.capture.permission.title': '选区访问',
  'settings.capture.permission.granted': '运行全局剪辑时，Foliole 可以复制当前选区。',
  'settings.capture.permission.denied': '请在“系统设置 → 隐私与安全性 → 辅助功能”中允许 Foliole。',
  'settings.capture.permission.checking': '正在检查选区访问权限…',
  'settings.capture.permission.unavailable': '暂时无法检查选区访问权限。',
  'settings.capture.permission.notRequired': '这台设备不需要额外的选区权限。',
  'settings.capture.permission.unsupported': '这台设备不支持全局剪辑。',
  'settings.capture.position.title': '完成提示位置',
  'settings.capture.position.description': '选择剪辑完成提示在这台 Mac 上的显示位置。',
  'settings.capture.position.topRight': '右上角',
  'settings.capture.position.bottomRight': '右下角'
};
