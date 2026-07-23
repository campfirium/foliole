import type { TranslationKey } from '../translations';

export const ZH_HANS_DESKTOP_WORDPRESS_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'desktop.wordpressPublish.dialogTitle': 'Publish to WordPress',
  'desktop.wordpressPublish.postTitle': '文章标题',
  'desktop.wordpressPublish.target': '目标站点',
  'desktop.wordpressPublish.mode': '操作',
  'desktop.wordpressPublish.mode.create': '创建新文章',
  'desktop.wordpressPublish.mode.update': '更新已关联文章',
  'desktop.wordpressPublish.status': '文章状态',
  'desktop.wordpressPublish.status.draft': '草稿',
  'desktop.wordpressPublish.status.publish': '发布',
  'desktop.wordpressPublish.category.placeholder': '选择分类',
  'desktop.wordpressPublish.catalog.loading': '正在加载分类和标签...',
  'desktop.wordpressPublish.catalog.error': '无法加载分类和标签，请重新打开面板后再试。',
  'desktop.wordpressPublish.confirm': '发布',
  'desktop.wordpressPublish.publishing': '正在发布...',
  'desktop.wordpressPublish.created': '已发布到 WordPress。',
  'desktop.wordpressPublish.updated': '已更新 WordPress 文章。',
  'desktop.wordpressPublish.viewPost': '查看文章',
  'desktop.wordpressPublish.error.publish': '无法发布到 WordPress。',
  'desktop.wordpressPublish.error.localSave': '文章已保存到远端，但 Foliole 无法保存文章关联。'
};
