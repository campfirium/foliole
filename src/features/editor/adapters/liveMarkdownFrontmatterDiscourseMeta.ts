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
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export function createDiscoursePublishedMetaItem(meta: DiscoursePublishedMeta | null): FrontmatterMetaItem | null {
  if (!meta?.url) return null;
  const locale = getStoredAppLocale();
  const dateText = formatPublishedDate(meta.lastPublishedAt);
  if (!dateText) return null;
  return {
    href: meta.url,
    text: locale.startsWith('zh') ? `发布于 ${dateText}` : `Published ${dateText}`,
    tooltip: meta.url
  };
}
