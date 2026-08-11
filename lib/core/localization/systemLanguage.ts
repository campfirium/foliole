export const SIMPLIFIED_CHINESE_LANGUAGE_TAG_PATTERN_SOURCE =
  '^zh-(?:(?:cn|sg)(?:-|$)|hans(?:-|$))';

const SIMPLIFIED_CHINESE_LANGUAGE_TAG_PATTERN = new RegExp(
  SIMPLIFIED_CHINESE_LANGUAGE_TAG_PATTERN_SOURCE,
  'u'
);

export function normalizeLanguageTag(language: string) {
  return language.trim().toLowerCase().replaceAll('_', '-');
}

export function isExplicitSimplifiedChineseLanguageTag(language: string) {
  return SIMPLIFIED_CHINESE_LANGUAGE_TAG_PATTERN.test(normalizeLanguageTag(language));
}

export function readPrimaryLanguage(languages: readonly string[]) {
  return languages[0] ?? '';
}
