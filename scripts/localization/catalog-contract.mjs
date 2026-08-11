const PLACEHOLDER_PATTERN = /\{[A-Za-z][A-Za-z0-9_]*\}/gu;
const HTML_TAG_PATTERN = /<\/?[A-Za-z][^>]*>/gu;
const URL_PATTERN = /https?:\/\/[^\s)]+/gu;
const MARKDOWN_PATTERN = /(?:\*\*|__|`|\[[^\]]*\]\([^)]*\))/gu;

function tokens(value, pattern) {
  return [...value.matchAll(pattern)].map((match) => match[0]).sort();
}

export function structuralTokens(value) {
  return [
    ...tokens(value, PLACEHOLDER_PATTERN),
    ...tokens(value, HTML_TAG_PATTERN),
    ...tokens(value, URL_PATTERN),
    ...tokens(value, MARKDOWN_PATTERN)
  ].sort();
}

export function protectedOccurrences(value, protectedLiterals) {
  const exact = protectedLiterals.exact.includes(value) ? [value] : [];
  const embedded = protectedLiterals.embedded.flatMap((literal) => {
    const count = value.split(literal).length - 1;
    return Array.from({ length: count }, () => literal);
  });
  return [...exact, ...embedded].sort();
}

export function compareEntry(key, english, translation, protectedLiterals) {
  const problems = [];
  if (JSON.stringify(structuralTokens(english)) !== JSON.stringify(structuralTokens(translation))) {
    problems.push(`${key}: structure or placeholders changed`);
  }
  const expectedProtected = protectedOccurrences(english, protectedLiterals);
  const actualProtected = protectedOccurrences(translation, protectedLiterals);
  if (JSON.stringify(expectedProtected) !== JSON.stringify(actualProtected)) {
    problems.push(`${key}: protected literal changed`);
  }
  return problems;
}

export function sourceConflicts(domains, protectedLiterals, semanticConflicts) {
  const conflicts = [];
  for (const { en, zh } of domains) {
    for (const [key, english] of Object.entries(en)) {
      if (!Object.prototype.hasOwnProperty.call(zh, key)) {
        conflicts.push(`${key}: missing Simplified Chinese reference`);
      } else {
        conflicts.push(...compareEntry(key, english, zh[key], protectedLiterals));
      }
      if (semanticConflicts[key]) conflicts.push(`${key}: ${semanticConflicts[key]}`);
    }
  }
  return conflicts;
}
