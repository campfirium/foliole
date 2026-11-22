/** Shown wherever a breadcrumb title holds a cloze gap or a hidden cloze answer. */
export const BREADCRUMB_CLOZE_MARK = '*';

const CLOZE_PLACEHOLDER = '[...]';
const GAP = '\uE000';
const GAP_RUN = /\uE000+/g;

interface ClozeAnswerSource {
  anchorLink?: { kind: string; locator?: unknown } | null;
  content?: string | null;
  reveal?: string | null;
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .replace(/(^|\s)#+\s*/g, '$1')
    .replace(/^\s*>\s*/, '');
}

function readLocatorTexts(locator: unknown): string[] {
  if (!locator || typeof locator !== 'object') return [];
  const record = locator as { originalText?: unknown; ranges?: unknown };
  if (typeof record.originalText === 'string') return [record.originalText];
  return Array.isArray(record.ranges) ? record.ranges.flatMap(readLocatorTexts) : [];
}

/** Answer texts a cloze node hides; its ancestors' titles must not show them. */
export function resolveClozeAnswerTexts(node: ClozeAnswerSource | null | undefined): string[] {
  if (!node) return [];
  const texts = node.anchorLink?.kind === 'cloze' ? readLocatorTexts(node.anchorLink.locator) : [];
  if (node.reveal && node.content?.includes(CLOZE_PLACEHOLDER)) texts.push(node.reveal);
  return [...new Set(texts.map(text => text.trim()).filter(Boolean))];
}

/**
 * Plain breadcrumb text for a stored title: inline Markdown marks and heading or tag hashes are dropped,
 * and a cloze gap, or any hidden answer text, becomes a single "*".
 */
export function toBreadcrumbTitleText(title: string, hiddenTexts: readonly string[] = []) {
  let value = title;
  for (const text of hiddenTexts) {
    for (const form of new Set([text, stripInlineMarkdown(text).trim()])) {
      if (form) value = value.split(form).join(GAP);
    }
  }
  value = stripInlineMarkdown(value.split(CLOZE_PLACEHOLDER).join(GAP)).replace(/\s+/g, ' ').trim();
  return value.replace(GAP_RUN, BREADCRUMB_CLOZE_MARK) || title.trim();
}
