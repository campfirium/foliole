export const CODE_FENCE_PATTERN = /^\s*`{3,}/;

export function createLineClass(text: string, inCodeBlock: boolean) {
  if (CODE_FENCE_PATTERN.test(text)) return 'cm-line-code-fence';
  if (inCodeBlock) return 'cm-line-code';
  if (/^#{3}(?:\s+|$)/.test(text)) return 'cm-line-h3';
  if (/^#{2}(?:\s+|$)/.test(text)) return 'cm-line-h2';
  if (/^#{1}(?:\s+|$)/.test(text)) return 'cm-line-h1';
  if (/^\s*(?:>\s*)+/.test(text)) return 'cm-line-quote';
  if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(text)) return 'cm-line-list-unordered cm-line-task-list';
  if (/^\s*[-*+]\s+/.test(text)) return 'cm-line-list-unordered';
  if (/^\s*\d+[.)]\s+/.test(text)) return 'cm-line-list';
  return null;
}
