/** Diagnostic identity only: never retain bind values, comments, or SQL literal contents. */
export function sqlFingerprint(sql: string) {
  return sql.replace(/[xX]?'(?:''|[^'])*(?:'|$)|"(?:""|[^"])*(?:"|$)|`(?:``|[^`])*(?:`|$)|\[[^\]]*(?:\]|$)|--[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)/gu,
    token => token.startsWith('--') || token.startsWith('/*') ? ' ' : '?')
    .replace(/\b(?:0x[\da-f]+|\d+(?:\.\d*)?(?:e[+-]?\d+)?)\b/giu, '?')
    .replace(/\s+/gu, ' ').trim().slice(0, 2000);
}
