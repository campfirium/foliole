import type { FormatCleanupRule, FormatCleanupSettings } from './formatCleanupTypes';

const DISPLAY_TOKENS: Record<string, string> = { '␠': ' ', '␣': ' ', '⇥': '\t', '↵': '\n' };

function decodeDisplayTokens(value: string) {
  return value.replace(/[␠␣⇥↵]/g, (token) => DISPLAY_TOKENS[token] ?? token);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePattern(value: string) {
  const decoded = decodeDisplayTokens(value);
  if (decoded.startsWith('/') && decoded.lastIndexOf('/') > 0) {
    const finalSlash = decoded.lastIndexOf('/');
    const source = decoded.slice(1, finalSlash);
    const flags = decoded.slice(finalSlash + 1);
    try {
      return { flags: flags.replace(/[gyd]/g, ''), isRegex: true, source };
    } catch {
      return null;
    }
  }
  return { flags: '', isRegex: false, source: escapeRegExp(decoded) };
}

function compileRule(rule: FormatCleanupRule) {
  const find = parsePattern(rule.find);
  const follow = parsePattern(rule.follow);
  if (!find || !follow || !find.source) return null;
  const repeatedFind = rule.scope === 'line-start' && !find.isRegex && decodeDisplayTokens(rule.find).length === 1;
  const source = `${rule.scope === 'line-start' ? '^' : ''}(?:${find.source})${repeatedFind ? '+' : ''}` +
    `${follow.source ? `(?:${follow.source})` : ''}`;
  try {
    return new RegExp(source, `${find.flags}${follow.flags}gm`.split('').filter((flag, index, flags) => flags.indexOf(flag) === index).join(''));
  } catch {
    return null;
  }
}

function isExcluded(text: string, offset: number, match: string, rule: FormatCleanupRule) {
  const not = decodeDisplayTokens(rule.not);
  if (!not) return false;
  const find = decodeDisplayTokens(rule.find);
  if (not === `${find}${find}` && find.length === 1) {
    return text[offset - 1] === find || text[offset + match.length] === find || text.slice(offset).startsWith(not);
  }
  const pattern = parsePattern(rule.not);
  if (!pattern) return false;
  try {
    const matcher = new RegExp(`^(?:${pattern.source})`, pattern.flags);
    return matcher.test(text.slice(offset)) || matcher.test(text.slice(offset + match.length));
  } catch {
    return false;
  }
}

function applyRule(text: string, rule: FormatCleanupRule, startsAtLineStart: boolean) {
  if (!rule.enabled || !rule.find) return text;
  const matcher = compileRule(rule);
  if (!matcher) return text;
  const replacement = decodeDisplayTokens(rule.replace);
  return text.replace(matcher, (match, ...args: unknown[]) => {
    const offset = [...args].reverse().find((value) => typeof value === 'number');
    if (typeof offset !== 'number' || (rule.scope === 'line-start' && offset === 0 && !startsAtLineStart) || isExcluded(text, offset, match, rule)) return match;
    return match.replace(matcher, replacement);
  });
}

function splitProtectedText(text: string) {
  const pattern = /(^[ \t]*(?:```|~~~)[^\n]*(?:\n[\s\S]*?^[ \t]*(?:```|~~~)[ \t]*$|$))|(`+[^`\n]*`+)|((?:https?:\/\/|mailto:|www\.)[^\s<>()]+)/gm;
  const parts: Array<{ protected: boolean; startsAtLineStart: boolean; text: string }> = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > cursor) parts.push({ protected: false, startsAtLineStart: cursor === 0 || text[cursor - 1] === '\n', text: text.slice(cursor, index) });
    parts.push({ protected: true, startsAtLineStart: index === 0 || text[index - 1] === '\n', text: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ protected: false, startsAtLineStart: cursor === 0 || text[cursor - 1] === '\n', text: text.slice(cursor) });
  return parts.length > 0 ? parts : [{ protected: false, startsAtLineStart: true, text }];
}

export function cleanFormatting(text: string, settings: FormatCleanupSettings) {
  return splitProtectedText(text).map((part) => {
    if (part.protected) return part.text;
    let result = part.text;
    if (settings.removeIndentation) result = result.replace(/^[ \t]+/gm, (match, offset) => offset === 0 && !part.startsAtLineStart ? match : '');
    for (const rule of [...settings.builtInRules, ...settings.customRules]) result = applyRule(result, rule, part.startsAtLineStart);
    if (settings.collapseBlankLines) result = result.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n');
    return result;
  }).join('');
}
