export function hasNodeContent(node: { content: string; hasContent?: boolean } | null | undefined) {
  if (!node) {
    return false;
  }
  if (typeof node.hasContent === 'boolean') {
    return node.hasContent;
  }
  return node.content.trim().length > 0;
}

export function hasNodeReveal(node: { reveal: string | null; hasReveal?: boolean } | null | undefined) {
  if (!node) {
    return false;
  }
  if (typeof node.hasReveal === 'boolean') {
    return node.hasReveal;
  }
  return node.reveal !== null;
}
