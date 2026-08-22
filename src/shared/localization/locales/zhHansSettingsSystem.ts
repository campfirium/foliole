import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_SYSTEM_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.general.system.section': '系统',
  'settings.general.system.aria': '系统设置区',
  'settings.general.openAtLogin.title': '开机时自动启动 Foliole',
  'settings.general.openAtLogin.description': '开机后让本地同步和全局剪辑保持可用。',
  'settings.general.openAtLogin.ineffective': 'Windows 已禁用此启动项。',
  'settings.general.openAtLogin.requiresApproval': '请在“系统设置 > 通用 > 登录项”中允许 Foliole。',
  'settings.general.openAtLogin.error': 'macOS 未找到此登录项，请尝试重新打开。',
  'settings.general.openAtLogin.unsupported': '当前版本无法设置自动启动。',
  'settings.general.openAtLogin.aria': '开机时自动启动 Foliole',
  'settings.search.generalOpenAtLogin.title': '开机时自动启动 Foliole',
  'settings.search.generalOpenAtLogin.description': '在受支持的桌面端安装中自动启动 Foliole。',
  'settings.search.generalOpenAtLogin.terms': '开机启动|自动启动|后台|常驻',
  'settings.general.systemEntryNames.section': '系统入口名称',
  'settings.general.systemEntryNames.description':
    '自定义名称随当前资料库共享。清空名称后重新跟随界面语言。',
  'settings.general.systemEntryNames.demoDescription':
    '这些名称只保存在当前浏览器 Demo 中。清空名称后重新跟随界面语言。',
  'settings.general.systemEntryNames.saveFailed': '名称未能保存，界面仍使用上次保存的名称。',
  'settings.general.systemEntryNames.upgradeRequired':
    '请先更新此同步组内的所有设备，再修改这些名称。',
  'settings.general.systemEntryNames.custom': '使用当前资料库保存的自定义名称。',
  'settings.general.systemEntryNames.followsLanguage': '跟随界面语言。',
  'settings.general.systemEntryNames.inputAria': '{name} 的自定义名称'
};
