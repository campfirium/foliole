export function renderMarkedSource(kind: 'highlight' | 'cloze', sourceText: string) {
  return kind === 'highlight' ? `==${sourceText}==` : `<u>${sourceText}</u>`;
}

export function stripLeadingMatchingHeading(value: string | null | undefined, articleTitle: string) {
  const trimmed = (value ?? '').trimStart();
  const escapedTitle = articleTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return trimmed.replace(new RegExp(`^#\\s+${escapedTitle}\\s*(?:\\n\\s*)*`, 'i'), '').trimStart();
}
