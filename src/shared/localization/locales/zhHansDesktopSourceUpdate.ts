import type { TranslationKey } from '../translations';

export const ZH_HANS_DESKTOP_SOURCE_UPDATE_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'desktop.sourceUpdate.dialogTitle': '来源更新面板',
  'desktop.sourceUpdate.reviewTitle': '审阅更新',
  'desktop.sourceUpdate.close': '关闭来源更新面板',
  'desktop.sourceUpdate.accept': '接受更新',
  'desktop.sourceUpdate.accepting': '正在接受...',
  'desktop.sourceUpdate.dismiss': '忽略',
  'desktop.sourceUpdate.current.title': '当前文档',
  'desktop.sourceUpdate.current.description': '这一侧保持主文档的阅读和编辑体验，并与更新后的来源同步滚动；来源多出的行会在这里留出对齐空隙。',
  'desktop.sourceUpdate.updated.title': '传入更新',
  'desktop.sourceUpdate.updated.description': '这一侧使用同样的文档渲染，只读显示，并跟随当前文档滚动；当前文档多出的行会在这里留出对齐空隙。',
  'desktop.sourceUpdate.summary.current': '当前',
  'desktop.sourceUpdate.summary.incoming': '传入更新',
  'desktop.sourceUpdate.summary.highlightCount.one': '{count} 处高亮',
  'desktop.sourceUpdate.summary.highlightCount.many': '{count} 处高亮',
  'desktop.sourceUpdate.summary.highlightsStay': '传入更新保留 {count} 处高亮',
  'desktop.sourceUpdate.summary.highlightsGrow': '传入更新为 {updated} 处高亮，原为 {current} 处',
  'desktop.sourceUpdate.summary.highlightsShrink': '传入更新为 {updated} 处高亮，原为 {current} 处',
  'desktop.sourceUpdate.overview.aria': '对比概览标尺',
  'desktop.sourceUpdate.overview.previous': '跳到上一处差异',
  'desktop.sourceUpdate.overview.next': '跳到下一处差异',
  'desktop.sourceUpdate.overview.marker.currentOnly': '跳到当前文档中第 {row} 行附近的独有内容',
  'desktop.sourceUpdate.overview.marker.updatedOnly': '跳到更新后来源中第 {row} 行附近的独有内容',
  'desktop.sourceUpdate.overview.marker.changed': '跳到第 {row} 行附近的变更内容'
};
