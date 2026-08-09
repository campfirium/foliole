import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_SYNC_GROUP_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.companionSync.group.title': '同步组',
  'settings.companionSync.group.description': '组名会在创建时保存。',
  'settings.companionSync.group.empty.description': '建立新的同步组，或加入当前网络中活跃设备提供的同步组。',
  'settings.companionSync.group.join.title': '加入请求',
  'settings.companionSync.group.join.description': '只批准你认识的设备。',
  'settings.companionSync.group.join.approve': '批准',
  'settings.companionSync.group.join.reject': '拒绝',
  'settings.companionSync.group.create': '建立同步组',
  'settings.companionSync.group.find': '查找同步组',
  'settings.companionSync.group.join.complete': '完成加入',
  'settings.companionSync.group.join.waiting': '正在等待批准；批准后会自动开始同步。',
  'settings.companionSync.group.join.named': '加入 {name}',
  'settings.companionSync.group.devices.title': '设备',
  'settings.companionSync.group.devices.description': '其他设备离线时，本设备仍会保留成员身份。',
  'settings.companionSync.group.devices.find': '查找设备',
  'settings.companionSync.group.devices.syncWith': '与 {name} 同步',
  'settings.companionSync.group.member.active': '已加入',
  'settings.companionSync.group.member.provisioning': '正在设置'
};
