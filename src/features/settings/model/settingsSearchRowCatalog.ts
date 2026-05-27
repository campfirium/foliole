import type { SettingsSearchRowMeta } from './settingsSearch';

export const ABOUT_SETTINGS_SEARCH_ROWS: SettingsSearchRowMeta[] = [
  {
    categoryId: 'about',
    description: 'Reader-first outlining and review workflow built with Electron + React.',
    id: 'about-foliole-desktop',
    title: 'Foliole desktop'
  },
  {
    categoryId: 'about',
    description: 'Create a local zip with logs and crash reports for support.',
    id: 'about-diagnostic-bundle',
    title: 'Diagnostic bundle'
  },
  {
    categoryId: 'about',
    description: 'Improves search for Chinese, Japanese, Korean, and other languages that are not separated by spaces.',
    id: 'about-search-enhancement',
    searchTerms: ['full text search', 'CJK search'],
    title: 'Search enhancement'
  }
];

export const EDITOR_SETTINGS_SEARCH_ROWS: SettingsSearchRowMeta[] = [
  {
    categoryId: 'editor',
    description: 'Automatically copy remote pictures in topics into your local library so they stay available offline.',
    id: 'editor-save-remote-images-locally',
    searchTerms: ['remote images', 'offline images'],
    title: 'Save remote images locally'
  },
  {
    categoryId: 'editor',
    description: 'Show markdown syntax markers on the active line, or keep them hidden everywhere.',
    id: 'editor-show-markdown-syntax-markers',
    searchTerms: ['markdown markers', 'syntax visibility'],
    title: 'Show markdown syntax markers'
  },
  {
    categoryId: 'editor',
    description: 'Inserted before annotation text when creating or adding a highlight annotation.',
    id: 'editor-highlight-annotation-prefix',
    title: 'Highlight annotation prefix'
  },
  {
    categoryId: 'editor',
    description: 'Fields shown under the title. Use commas for groups and | for aliases.',
    id: 'editor-frontmatter-meta',
    title: 'Frontmatter meta'
  },
  {
    categoryId: 'editor',
    description: 'When both length checks are exceeded, ask first, create a highlight, or allow the cloze.',
    id: 'editor-long-cloze-mistake-guard',
    title: 'Long cloze mistake guard'
  }
];

export const REVIEW_SETTINGS_SEARCH_ROWS: SettingsSearchRowMeta[] = [
  {
    categoryId: 'review',
    description: 'Lower values shorten intervals. Recommended around 0.80-0.95.',
    id: 'review-desired-retention',
    title: 'Desired retention'
  },
  {
    categoryId: 'review',
    description: 'Cap long-term intervals in days.',
    id: 'review-maximum-interval',
    title: 'Maximum interval'
  },
  {
    categoryId: 'review',
    description: 'Cards due on a day become available from this local time.',
    id: 'review-new-day-starts-at',
    title: 'New day starts at'
  },
  {
    categoryId: 'review',
    description: 'Fallback priority for new topics when neither the topic nor its ancestors set one.',
    id: 'review-default-topic-priority',
    title: 'Default topic priority'
  },
  {
    categoryId: 'review',
    description: 'How often a reading card is drawn against a review card.',
    id: 'review-reading-vs-review-mix',
    title: 'Reading vs review mix'
  }
];

export const MOUSE_GESTURE_SETTINGS_SEARCH_ROWS: SettingsSearchRowMeta[] = [
  {
    categoryId: 'mouse-gestures',
    description: 'More areas can be added later without changing the gesture model.',
    id: 'mouse-gestures-active-area',
    title: 'Active area'
  },
  {
    categoryId: 'mouse-gestures',
    description: 'Main panel gesture trail color.',
    id: 'mouse-gestures-line-color',
    title: 'Line color'
  },
  {
    categoryId: 'mouse-gestures',
    description: 'Visible stroke width for the gesture trail.',
    id: 'mouse-gestures-line-width',
    title: 'Line width (px)'
  },
  {
    categoryId: 'mouse-gestures',
    description: 'Minimum movement before a direction is accepted.',
    id: 'mouse-gestures-direction-threshold',
    title: 'Direction threshold (px)'
  }
];

export const LIBRARY_SETTINGS_SEARCH_ROWS: SettingsSearchRowMeta[] = [
  {
    categoryId: 'library',
    description: 'Main library root for your long-term data.',
    id: 'library-home',
    title: 'Library Home'
  },
  {
    categoryId: 'library',
    description: 'Folder for attachments and copied media.',
    id: 'library-assets',
    title: 'Assets'
  },
  {
    categoryId: 'library',
    description: 'Drop folder for incoming files.',
    id: 'library-inbox',
    title: 'Inbox'
  },
  {
    categoryId: 'library',
    description: 'A read-only Markdown export Foliole regenerates automatically.',
    id: 'library-mirror',
    title: 'Mirror'
  },
  {
    categoryId: 'library',
    description: 'Rebuild daily mirror output for recovery or rule changes.',
    id: 'library-mirror-output',
    title: 'Mirror output'
  },
  {
    categoryId: 'library',
    description: 'Rebuild links after moving Mirror or Assets folders.',
    id: 'library-mirror-links',
    title: 'Mirror links'
  }
];

export const SETTINGS_SEARCH_ROWS: SettingsSearchRowMeta[] = [
  ...ABOUT_SETTINGS_SEARCH_ROWS,
  ...EDITOR_SETTINGS_SEARCH_ROWS,
  ...REVIEW_SETTINGS_SEARCH_ROWS,
  ...MOUSE_GESTURE_SETTINGS_SEARCH_ROWS,
  ...LIBRARY_SETTINGS_SEARCH_ROWS
];
