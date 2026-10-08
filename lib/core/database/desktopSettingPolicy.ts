import { DECLARED_SETTING_KEYS, resolveSettingDataPolicy, type SettingScope } from './settingDataPolicy.js';

export type DesktopSettingScope = SettingScope;

export const DESKTOP_SETTING_PLATFORM = 'windows';
export const DESKTOP_SETTING_FORM_FACTOR = 'desktop';

export const DESKTOP_DECLARED_SETTING_KEYS = DECLARED_SETTING_KEYS;

export const DESKTOP_INTERNAL_SETTINGS_KEYS = [
  'workspace_search_queued_revision',
  'workspace_search_source_identity',
  'workspace_search_source_revision'
] as const;

export interface DesktopSettingPolicy {
  canonical: boolean;
  declared: boolean;
  scope: DesktopSettingScope;
}

export interface DesktopSettingIdentity {
  hostName: string;
  formFactor: string;
  key: string;
  objectId: string;
  platform: string;
  scope: Exclude<DesktopSettingScope, 'local_only'>;
}

export function resolveDesktopSettingPolicy(key: string): DesktopSettingPolicy {
  const { declared, scope } = resolveSettingDataPolicy(key);
  return { canonical: scope !== 'local_only', declared, scope };
}

export function resolveDesktopSettingIdentity(key: string, currentHostName: string | null): DesktopSettingIdentity | null {
  const policy = resolveDesktopSettingPolicy(key);
  if (!policy.canonical || policy.scope === 'local_only') return null;
  const hostName = policy.scope === 'user_space' ? '*' : currentHostName?.trim();
  if (!hostName) return null;
  return {
    hostName,
    formFactor: DESKTOP_SETTING_FORM_FACTOR,
    key,
    objectId: `${policy.scope}:${DESKTOP_SETTING_PLATFORM}:${DESKTOP_SETTING_FORM_FACTOR}:${hostName}:${key}`,
    platform: DESKTOP_SETTING_PLATFORM,
    scope: policy.scope
  };
}

export function canMaterializeDesktopSetting(
  identity: Omit<DesktopSettingIdentity, 'objectId'>,
  currentHostName: string | null
) {
  const policy = resolveDesktopSettingPolicy(identity.key);
  if (!policy.declared || !policy.canonical || policy.scope !== identity.scope) return false;
  if (identity.platform !== DESKTOP_SETTING_PLATFORM || identity.formFactor !== DESKTOP_SETTING_FORM_FACTOR) return false;
  const expectedHostName = policy.scope === 'user_space' ? '*' : currentHostName?.trim();
  return Boolean(expectedHostName) && identity.hostName === expectedHostName;
}
