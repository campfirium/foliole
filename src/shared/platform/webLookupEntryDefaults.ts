export const WEB_LOOKUP_SELECTION_PLACEHOLDER = '{selection}';
export const WEB_LOOKUP_TITLE_PLACEHOLDER = '{title}';
export const WEB_LOOKUP_QUERY_MAX_LENGTH = 4000;
export const WEB_LOOKUP_PROMPT_MAX_ENCODED_LENGTH = 5850;

export type WebLookupEntryKind = 'prompt' | 'search';

export interface WebLookupEntry {
  builtIn: boolean;
  enabled: boolean;
  id: string;
  kind: WebLookupEntryKind;
  label: string;
  urlTemplate: string;
}

export const CHATGPT_SUMMARIZE_SELECTION_DEFAULT_LINK = [
  'https://chatgpt.com/?prompt=Summarize the following selection:',
  '',
  WEB_LOOKUP_SELECTION_PLACEHOLDER
].join('%0A');

export const CHATGPT_DEFAULT_LINK = [
  'https://chatgpt.com/?prompt=',
  `${WEB_LOOKUP_SELECTION_PLACEHOLDER}（《${WEB_LOOKUP_TITLE_PLACEHOLDER}》）`
].join('');

export const CHATGPT_CONTENT_DEFAULT_LINK = [
  'https://chatgpt.com/?prompt=Summarize the following content:',
  '',
  'Content:',
  WEB_LOOKUP_SELECTION_PLACEHOLDER
].join('%0A');

export const CHATGPT_OLD_DEFAULT_LINK = [
  'https://chatgpt.com/?prompt=Please summarize the text inside %3Cselection%3E.',
  '%3Cselection%3E',
  WEB_LOOKUP_SELECTION_PLACEHOLDER,
  '%3C%2Fselection%3E'
].join('%0A');
export const CHATGPT_TEXT_DEFAULT_LINK = [
  'https://chatgpt.com/?prompt=Please summarize the following text.',
  '%3Ctext%3E',
  WEB_LOOKUP_SELECTION_PLACEHOLDER,
  '%3C%2Ftext%3E'
].join('%0A');
export const CHATGPT_SOURCE_TEXT_DEFAULT_LINK = [
  'https://chatgpt.com/?prompt=Summarize the text below.',
  '%3Csource_text%3E',
  WEB_LOOKUP_SELECTION_PLACEHOLDER,
  '%3C%2Fsource_text%3E'
].join('%0A');
export const CHATGPT_TEXT_LABEL_DEFAULT_LINK = [
  'https://chatgpt.com/?prompt=Summarize the following text:',
  '',
  'Text:',
  WEB_LOOKUP_SELECTION_PLACEHOLDER
].join('%0A');

export const BUILT_IN_WEB_LOOKUP_ENTRIES: WebLookupEntry[] = [
  {
    builtIn: true,
    enabled: true,
    id: 'chatgpt',
    kind: 'prompt',
    label: 'Chat with ChatGPT',
    urlTemplate: CHATGPT_DEFAULT_LINK
  },
  {
    builtIn: true,
    enabled: true,
    id: 'google',
    kind: 'search',
    label: 'Search with Google',
    urlTemplate: `https://www.google.com/search?q=${WEB_LOOKUP_SELECTION_PLACEHOLDER}`
  },
  {
    builtIn: true,
    enabled: false,
    id: 'duckduckgo',
    kind: 'search',
    label: 'Search with DuckDuckGo',
    urlTemplate: `https://duckduckgo.com/?q=${WEB_LOOKUP_SELECTION_PLACEHOLDER}`
  }
];
