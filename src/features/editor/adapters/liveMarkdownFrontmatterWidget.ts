import { StateEffect } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';

import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate, type TranslationKey } from '../../../shared/localization/translations';
import { parseFrontmatterMetaFieldGroups } from '../model/frontmatterMetaFieldsSetting';
import type { FrontmatterEntry } from '../model/markdownFrontmatterProjection';

import { openExternalLinkFacet } from './liveMarkdownState';

export const setFrontmatterModeEffect = StateEffect.define<'compact' | 'full'>();

interface FrontmatterMetaItem {
  href: string | null;
  text: string;
  tooltip: string;
}

function t(key: TranslationKey) {
  return translate(getStoredAppLocale(), key);
}

function isSourceLikeField(key: string) {
  return ['link', 'source', 'source_url', 'url'].includes(key.toLowerCase());
}

function resolveUrlCandidate(value: string) {
  const text = value.trim();
  if (!text) return null;
  try {
    return new URL(text);
  } catch {
    if (!/^[^\s:/?#]+\.[^\s:/?#]+(?:[/?#].*)?$/.test(text)) return null;
    try {
      return new URL(`https://${text}`);
    } catch {
      return null;
    }
  }
}

function displaySourceText(value: string) {
  const url = resolveUrlCandidate(value);
  return url ? url.hostname.replace(/^www\./i, '') : value;
}

function getEntryText(entry: FrontmatterEntry, key: string) {
  const isSource = isSourceLikeField(key);
  return entry.values
    .map((value) => isSource ? displaySourceText(value.href ?? value.text) : value.text)
    .filter(Boolean)
    .join(', ');
}

function getEntryTooltip(entry: FrontmatterEntry) {
  return entry.values.map((value) => value.href ?? value.text).filter(Boolean).join('\n') || entry.key;
}

function getEntryHref(entry: FrontmatterEntry, key: string) {
  const href = entry.values.find((value) => value.href)?.href;
  if (href) return href;
  if (!isSourceLikeField(key)) return null;
  const url = entry.values.map((value) => resolveUrlCandidate(value.text)).find(Boolean);
  return url?.href ?? null;
}

function openFrontmatterHref(view: EditorView, href: string, event: MouseEvent | KeyboardEvent) {
  const onOpenExternalLink = view.state.facet(openExternalLinkFacet) ?? null;
  if (!onOpenExternalLink) return;
  event.preventDefault();
  event.stopPropagation();
  onOpenExternalLink({
    ...('clientX' in event ? { anchorPoint: { x: event.clientX, y: event.clientY } } : {}),
    href
  });
}

function findEntry(entries: readonly FrontmatterEntry[], fieldName: string) {
  const normalized = fieldName.toLowerCase();
  return entries.find((entry) => entry.key.toLowerCase() === normalized && entry.values.length > 0) ?? null;
}

export function resolveFrontmatterMetaItems(
  entries: readonly FrontmatterEntry[],
  fields: string
): FrontmatterMetaItem[] {
  return parseFrontmatterMetaFieldGroups(fields).flatMap((group) => {
    for (const fieldName of group) {
      const entry = findEntry(entries, fieldName);
      if (!entry) continue;
      const text = getEntryText(entry, fieldName);
      if (text) return [{ href: getEntryHref(entry, fieldName), text, tooltip: getEntryTooltip(entry) }];
    }
    return [];
  });
}

function createFrontmatterMetaNode(view: EditorView, item: FrontmatterMetaItem) {
  const element = document.createElement('span');
  const href = item.href;
  element.className = href ? 'cm-md-frontmatter-meta-item cm-md-frontmatter-meta-link' : 'cm-md-frontmatter-meta-item';
  element.textContent = item.text;
  element.title = item.tooltip;
  if (href) {
    element.dataset.mdLinkUrl = href;
    element.role = 'link';
    element.tabIndex = 0;
    element.addEventListener('click', (event) => openFrontmatterHref(view, href, event));
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') openFrontmatterHref(view, href, event);
    });
  }
  return element;
}

function createSeparator() {
  const separator = document.createElement('span');
  separator.className = 'cm-md-frontmatter-separator';
  separator.textContent = ' ';
  return separator;
}

export class FrontmatterCompactWidget extends WidgetType {
  constructor(
    private readonly entries: readonly FrontmatterEntry[],
    private readonly metaFields: string
  ) {
    super();
  }

  override eq(other: FrontmatterCompactWidget) {
    return other.metaFields === this.metaFields && other.entries === this.entries;
  }

  override toDOM(view: EditorView) {
    const element = document.createElement('div');
    element.className = 'cm-md-frontmatter-compact';

    const metaLine = createFrontmatterMetaLine(view, this.entries, this.metaFields);
    const button = createFrontmatterToggle(t('desktop.editor.frontmatter.meta'), () => {
      view.dispatch({ effects: setFrontmatterModeEffect.of('full') });
    });

    element.append(metaLine, button);
    return element;
  }
}

function createFrontmatterToggle(label: string, onToggle: () => void) {
  const button = document.createElement('button');
  button.className = 'cm-md-frontmatter-toggle';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  });
  return button;
}

function createFrontmatterMetaLine(view: EditorView, entries: readonly FrontmatterEntry[], metaFields: string) {
  const metaLine = document.createElement('div');
  metaLine.className = 'cm-md-frontmatter-meta-line';
  resolveFrontmatterMetaItems(entries, metaFields).forEach((item, index) => {
    if (index > 0) metaLine.append(createSeparator());
    metaLine.append(createFrontmatterMetaNode(view, item));
  });
  return metaLine;
}

function createFrontmatterHeader(view: EditorView, entries: readonly FrontmatterEntry[], metaFields: string) {
  const header = document.createElement('div');
  header.className = 'cm-md-frontmatter-header';
  header.append(
    createFrontmatterMetaLine(view, entries, metaFields),
    createFrontmatterToggle(t('desktop.editor.frontmatter.close'), () => {
      view.dispatch({ effects: setFrontmatterModeEffect.of('compact') });
    })
  );
  return header;
}

export class FrontmatterYamlWidget extends WidgetType {
  constructor(
    private readonly entries: readonly FrontmatterEntry[],
    private readonly metaFields: string,
    private readonly from: number,
    private readonly text: string,
    private readonly to: number
  ) {
    super();
  }

  override eq(other: FrontmatterYamlWidget) {
    return other.from === this.from
      && other.metaFields === this.metaFields
      && other.text === this.text
      && other.to === this.to
      && other.entries === this.entries;
  }

  override toDOM(view: EditorView) {
    const element = document.createElement('div');
    element.className = 'cm-md-frontmatter-yaml';

    const input = document.createElement('textarea');
    input.className = 'cm-md-frontmatter-yaml-input';
    input.defaultValue = this.text;
    input.spellcheck = false;
    input.rows = Math.max(3, this.text.split('\n').length);
    input.addEventListener('blur', () => {
      if (input.value === this.text) return;
      view.dispatch({ changes: { from: this.from, insert: input.value, to: this.to } });
    });

    element.append(createFrontmatterHeader(view, this.entries, this.metaFields), input);
    return element;
  }
}
