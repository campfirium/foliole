import type { FormatCleanupRule, FormatCleanupSettings } from './formatCleanupTypes';

const lineStartRule = (id: string, find: string): FormatCleanupRule => ({
  enabled: true,
  find,
  follow: '␣',
  id,
  not: '',
  replace: '',
  scope: 'line-start'
});

export const DEFAULT_FORMAT_CLEANUP_RULES: FormatCleanupRule[] = [
  lineStartRule('line-dash', '-'),
  lineStartRule('line-heading', '#'),
  lineStartRule('line-quote', '>'),
  lineStartRule('line-plus', '+'),
  lineStartRule('line-bullet', '•'),
  {
    enabled: true,
    find: '*',
    follow: '',
    id: 'single-asterisk',
    not: '**',
    replace: '',
    scope: 'any'
  }
];

export function createDefaultFormatCleanupSettings(): FormatCleanupSettings {
  return {
    builtInRules: DEFAULT_FORMAT_CLEANUP_RULES.map((rule) => ({ ...rule })),
    collapseBlankLines: true,
    customRules: [],
    customized: false,
    removeIndentation: true
  };
}

export function createEmptyCustomCleanupRule(id: string): FormatCleanupRule {
  return { enabled: true, find: '', follow: '', id, not: '', replace: '', scope: 'any' };
}
