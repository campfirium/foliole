function consumeLabelWhitespaceBefore(markdown: string, index: number) {
  let cursor = index;
  while (cursor > 0 && /\s/u.test(markdown[cursor - 1] ?? '')) cursor -= 1;
  return cursor;
}

function findWrappingLinkEnd(markdown: string, targetStart: number) {
  let depth = 0;
  for (let index = targetStart; index < markdown.length; index += 1) {
    const character = markdown[index];
    if (character === '\n') return -1;
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character !== ')') continue;
    if (depth === 0) return index + 1;
    depth -= 1;
  }
  return -1;
}

export function resolveMarkdownImageWrappingLink(markdown: string, imageFrom: number, imageTo: number) {
  const labelStart = consumeLabelWhitespaceBefore(markdown, imageFrom);
  if (markdown[labelStart - 1] !== '[') return null;
  const labelEnd = markdown.indexOf('](', imageTo);
  if (labelEnd < 0) return null;
  const linkTargetStart = labelEnd + 2;
  const linkEnd = findWrappingLinkEnd(markdown, linkTargetStart);
  if (linkEnd < 0) return null;
  return {
    from: labelStart - 1,
    target: markdown.slice(linkTargetStart, linkEnd - 1),
    to: linkEnd
  };
}
