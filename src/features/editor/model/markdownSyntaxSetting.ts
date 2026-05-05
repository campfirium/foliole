import {
  APP_SETTINGS_STORAGE_KEYS,
  DEFAULT_PERSISTED_APP_SETTINGS,
  type MarkdownSyntaxVisibility
} from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export type { MarkdownSyntaxVisibility } from '../../../shared/config/appSettings';

export const MARKDOWN_SYNTAX_VISIBILITY_KEY = APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility;
export const MARKDOWN_SYNTAX_VISIBILITY_DEFAULT: MarkdownSyntaxVisibility = DEFAULT_PERSISTED_APP_SETTINGS.markdownSyntaxVisibility;

function isMarkdownSyntaxVisibility(value: string): value is MarkdownSyntaxVisibility {
  return value === 'hidden' || value === 'visible';
}

export function getMarkdownSyntaxVisibility(): MarkdownSyntaxVisibility {
  const raw = getWhitelistedLocalStorageItem(MARKDOWN_SYNTAX_VISIBILITY_KEY);
  if (!raw || !isMarkdownSyntaxVisibility(raw)) {
    return MARKDOWN_SYNTAX_VISIBILITY_DEFAULT;
  }
  return raw;
}

export function setMarkdownSyntaxVisibility(value: MarkdownSyntaxVisibility) {
  setWhitelistedLocalStorageItem(MARKDOWN_SYNTAX_VISIBILITY_KEY, value);
}
