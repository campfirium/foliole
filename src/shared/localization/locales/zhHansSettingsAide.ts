import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_AIDE_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.general.aide.byok.section': '你的模型',
  'settings.general.aide.byok.aria': '你的模型设置',
  'settings.general.aide.byok.description': '在这台设备上为 Foliole Aide 连接一个兼容 OpenAI Chat Completions 的端点。',
  'settings.general.aide.byok.endpoint.title': 'API 端点',
  'settings.general.aide.byok.endpoint.aria': '模型 API 端点',
  'settings.general.aide.byok.model.title': '模型',
  'settings.general.aide.byok.model.aria': '模型名称',
  'settings.general.aide.byok.key.title': 'API key',
  'settings.general.aide.byok.key.aria': '模型 API key',
  'settings.general.aide.byok.key.description': '密钥会为这台设备加密保存，此后不再显示。',
  'settings.general.aide.byok.key.endpointChanged': '更改端点时，请输入新的 API key。',
  'settings.general.aide.byok.status.title': '连接状态',
  'settings.general.aide.byok.status.configured': '已可在 Foliole Aide 中使用。',
  'settings.general.aide.byok.status.notConfigured': '填写全部三项以连接你的模型。',
  'settings.general.aide.byok.status.secureStorageUnavailable': '本机安全存储不可用，API key 未被读取。',
  'settings.general.aide.byok.save': '保存',
  'settings.general.aide.byok.saving': '正在保存...',
  'settings.general.aide.byok.remove': '移除',
  'settings.general.aide.byok.error.title': '未能保存你的模型设置',
  'settings.general.aide.byok.error.description': '请检查端点、模型与 API key 后重试。'
};
