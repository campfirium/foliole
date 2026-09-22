const FRONTMATTER_DELIMITER_PATTERN = /^\s*---\s*$/;
const FRONTMATTER_KEY_VALUE_PATTERN = /^([^:#\s][^:]*?)(\s*:\s*)(.*)$/;
const FRONTMATTER_LIST_ITEM_PATTERN = /^(\s*)-\s+(.*)$/;
const WIKILINK_WRAPPER_PATTERN = /\[\[([^\]]+)\]\]/g;

function normalizeAuthorValue(value: string) {
  return value.replace(WIKILINK_WRAPPER_PATTERN, '$1').trim().replace(/\s+/g, ' ');
}

function readFrontmatterLines(content: string) {
  const lines = content.split('\n');
  if (lines.length < 3 || !FRONTMATTER_DELIMITER_PATTERN.test(lines[0] ?? '')) {
    return [];
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (FRONTMATTER_DELIMITER_PATTERN.test(lines[index] ?? '')) {
      return lines.slice(1, index);
    }
  }
  return [];
}

export function readNodeAuthorText(content: string) {
  const values: string[] = [];
  let currentKey = '';
  for (const line of readFrontmatterLines(content)) {
    const keyMatch = line.match(FRONTMATTER_KEY_VALUE_PATTERN);
    if (keyMatch) {
      currentKey = keyMatch[1]?.trim().toLocaleLowerCase() ?? '';
      if (currentKey === 'author') {
        const value = normalizeAuthorValue(keyMatch[3] ?? '');
        if (value) values.push(value);
      }
      continue;
    }
    const listMatch = line.match(FRONTMATTER_LIST_ITEM_PATTERN);
    if (listMatch && currentKey === 'author') {
      const value = normalizeAuthorValue(listMatch[2] ?? '');
      if (value) values.push(value);
    }
  }
  return values.length > 0 ? values.join(', ') : null;
}
