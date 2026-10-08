export const NODE_TITLE_MAX_CHARS = 100;

export function normalizeNodeTitle(value: string): string {
  let title = '';
  let count = 0;
  for (const character of value) {
    if (count === NODE_TITLE_MAX_CHARS) break;
    title += character;
    count += 1;
  }
  return title;
}

export function isNodeTitleTruncated(value: string): boolean {
  return normalizeNodeTitle(value).length < value.length;
}
