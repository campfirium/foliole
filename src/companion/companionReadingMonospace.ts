import type { MonospaceFontPreset } from '../features/settings/model/appearanceSettingsOptions';
import { resolveMonospaceFontFamily } from '../features/settings/model/appearanceTypography';
import { MONOSPACE_PRESET_OPTION_VALUES } from '../features/settings/model/settingsPanelOptions';

export type CompanionMonospaceFont = Exclude<MonospaceFontPreset, 'custom'> | `system:${string}`;

export function normalizeMonospaceFont(value: unknown): CompanionMonospaceFont | undefined {
  if (value === 'default') return undefined;
  if (typeof value !== 'string') return undefined;
  if (/^system:[\p{L}\p{N} ._-]{1,80}$/u.test(value)) return value as CompanionMonospaceFont;
  return MONOSPACE_PRESET_OPTION_VALUES.includes(value as MonospaceFontPreset)
    ? value as CompanionMonospaceFont : undefined;
}

export function companionMonospaceFontFamily(value?: CompanionMonospaceFont) {
  return value?.startsWith('system:')
    ? resolveMonospaceFontFamily('custom', value.slice(7))
    : resolveMonospaceFontFamily((value ?? 'default') as MonospaceFontPreset, '');
}
