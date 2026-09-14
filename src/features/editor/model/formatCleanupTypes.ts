export type FormatCleanupRuleScope = 'any' | 'line-start';

export interface FormatCleanupRule {
  enabled: boolean;
  find: string;
  follow: string;
  id: string;
  not: string;
  replace: string;
  scope: FormatCleanupRuleScope;
}

export interface FormatCleanupSettings {
  builtInRules: FormatCleanupRule[];
  collapseBlankLines: boolean;
  customRules: FormatCleanupRule[];
  customized: boolean;
  removeIndentation: boolean;
}

export interface StoredFormatCleanupSettings extends FormatCleanupSettings {
  knownBuiltInRuleIds: string[];
  version: 1;
}
