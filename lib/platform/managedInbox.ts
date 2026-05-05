export const MANAGED_INBOX_APP_SETTING_KEY = 'foliole-managed-inbox-path';
export const MANAGED_INBOX_DEFAULT_DIRNAME = 'inbox';

export function normalizeManagedInboxPath(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
