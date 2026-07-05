import type { DiscoursePublishedMeta } from '../../../../lib/core/discourse/discourseFrontmatter';
import { getStoredAppLocale } from '../../../shared/localization/appLanguage';

export interface FrontmatterMetaItem {
  href: string | null;
  text: string;
  tooltip: string;
}

function formatPublishedDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short' }).format(date);
}

function getPostedLabel(locale: string) {
  if (locale.startsWith('zh-Hant') || locale === 'zh-TW' || locale === 'zh-HK') return '發布';
  if (locale.startsWith('zh')) return '发布';
  return 'Posted';
}

export function createDiscoursePublishedMetaItem(meta: DiscoursePublishedMeta | null): FrontmatterMetaItem | null {
  if (!meta?.url) return null;
  const locale = getStoredAppLocale();
  const dateText = formatPublishedDate(meta.lastPublishedAt);
  if (!dateText) return null;
  return {
    href: meta.url,
    text: `${getPostedLabel(locale)} ${dateText}`,
    tooltip: meta.url
  };
}
