import type { TranslationKey } from '../../../shared/localization/translations';

type Translate = (key: TranslationKey) => string;

const EDITOR_ACTION_TIPS = [
  {
    title: 'desktop.command.cleanFormatting',
    path: 'settings.search.cleanFormatting.path',
    terms: 'settings.search.cleanFormatting.terms'
  },
  {
    title: 'companion.imageCloze.title',
    path: 'settings.search.imageCloze.path',
    terms: 'settings.search.imageCloze.terms'
  },
  {
    title: 'companion.formulaCloze.title',
    path: 'settings.search.formulaCloze.path',
    terms: 'settings.search.formulaCloze.terms'
  }
] as const;

export function querySettingsSearchTips(query: string, t: Translate) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];
  return EDITOR_ACTION_TIPS.flatMap((tip) => {
    const title = t(tip.title);
    const matches = [title, ...t(tip.terms).split('|')].some(
      (term) => term.toLocaleLowerCase().includes(normalizedQuery)
    );
    return matches ? [{ id: tip.title, title, path: t(tip.path) }] : [];
  });
}
