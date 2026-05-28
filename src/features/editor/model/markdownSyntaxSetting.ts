import {
  APP_SETTINGS_STORAGE_KEYS,
  DEFAULT_PERSISTED_APP_SETTINGS,
  type MarkdownSyntaxVisibility
} from '../../../shared/config/appSettings';
import { setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export type { MarkdownSyntaxVisibility } from '../../../shared/config/appSettings';

export const MARKDOWN_SYNTAX_VISIBILITY_KEY = APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility;
export const MARKDOWN_SYNTAX_VISIBILITY_DEFAULT: MarkdownSyntaxVisibility = DEFAULT_PERSISTED_APP_SETTINGS.markdownSyntaxVisibility;

export function getMarkdownSyntaxVisibility(): MarkdownSyntaxVisibility {
  return MARKDOWN_SYNTAX_VISIBILITY_DEFAULT;
}

export function setMarkdownSyntaxVisibility(value?: MarkdownSyntaxVisibility) {
  void value;
  setWhitelistedLocalStorageItem(MARKDOWN_SYNTAX_VISIBILITY_KEY, MARKDOWN_SYNTAX_VISIBILITY_DEFAULT);
}
