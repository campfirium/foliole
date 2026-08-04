import type { TranslationKey } from '../translations';

export const ZH_HANS_DESKTOP_AIDE_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'desktop.rightPanel.assistant.model.settings': '模型与性能设置',
  'desktop.rightPanel.assistant.model.loading': '正在载入可用模型与性能设置…',
  'desktop.rightPanel.assistant.model.unavailable': '模型与性能设置暂不可用。消息将使用 Codex 默认配置。',
  'desktop.rightPanel.assistant.model.tooltip': '模型：{model} · 推理强度：{effort} · 速度：{speed}',
  'desktop.rightPanel.assistant.model.model': '模型',
  'desktop.rightPanel.assistant.model.reasoning': '推理强度',
  'desktop.rightPanel.assistant.model.effort.none': '无',
  'desktop.rightPanel.assistant.model.effort.minimal': '最低',
  'desktop.rightPanel.assistant.model.effort.low': '低',
  'desktop.rightPanel.assistant.model.effort.medium': '中',
  'desktop.rightPanel.assistant.model.effort.high': '高',
  'desktop.rightPanel.assistant.model.effort.xhigh': '极高',
  'desktop.rightPanel.assistant.model.effort.max': '最大',
  'desktop.rightPanel.assistant.model.effort.ultra': '超高',
  'desktop.rightPanel.assistant.model.speed': '速度',
  'desktop.rightPanel.assistant.model.defaultSpeed': '默认'
};
