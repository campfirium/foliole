import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_AIDE_PERMISSIONS_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.aideDialog.permissions.nav': 'AI 权限',
  'settings.aideDialog.permissions.description': '权限变更从下一条消息起生效。',
  'settings.aideDialog.permissions.reset': '恢复默认',
  'settings.aideDialog.permissions.read.title': '读取权限',
  'settings.aideDialog.permissions.readBudget.title': '每次回答的读取上限（token）',
  'settings.aideDialog.permissions.read.current.title': '当前材料',
  'settings.aideDialog.permissions.read.baseTopic.title': '所属原生主题和派生材料',
  'settings.aideDialog.permissions.read.folder.title': '文件夹',
  'settings.aideDialog.permissions.read.home.title': '材料',
  'settings.aideDialog.permissions.read.virtual.title': '索引',
  'settings.aideDialog.permissions.read.dives.title': '专题',
  'settings.aideDialog.permissions.read.external.title': '参考',
  'settings.aideDialog.permissions.read.trash.title': '回收站',
  'settings.aideDialog.permissions.write.title': '修改权限',
  'settings.aideDialog.permissions.askBeforeWrite.title': '修改前确认',
  'settings.aideDialog.permissions.write.createExcerpt.title': '新建摘录',
  'settings.aideDialog.permissions.write.createMaterial.title': '新建文件夹、主题和检测项',
  'settings.aideDialog.permissions.write.editContent.title': '修改内容',
  'settings.aideDialog.permissions.write.moveAndOrder.title': '移动和排序',
  'settings.aideDialog.permissions.write.trash.title': '移入回收站和恢复',
  'settings.aideDialog.permissions.write.manageIndexes.title': '管理索引',
  'settings.aideDialog.permissions.write.manageDives.title': '管理专题',
  'settings.aideDialog.permissions.saveFailed': 'AI 权限设置未能保存。'
};
