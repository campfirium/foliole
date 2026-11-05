import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import protectedLiterals from './protected-literals.json' with { type: 'json' };
import { compareEntry, protectedOccurrences, sourceConflicts } from './catalog-contract.mjs';
import { loadSourceDomains, flattenDomains } from './catalog-source.mjs';

describe('localization catalog contract', () => {
  it('protects placeholders, structure, and registered literals', () => {
    const literals = { embedded: ['WordPress'] };
    expect(compareEntry('sample', 'Publish to WordPress {count}', 'Auf der Website veröffentlichen', literals))
      .toEqual([
        'sample: structure or placeholders changed',
        'sample: protected literal changed'
      ]);
  });

  it('blocks AI input when a reviewer records an English-Chinese semantic conflict', () => {
    const domains = [{ en: { 'sample.key': 'Delete topic' }, zh: { 'sample.key': '保留主题' } }];
    expect(sourceConflicts(domains, { embedded: [] }, { 'sample.key': 'opposite action commitment' }))
      .toContain('sample.key: opposite action commitment');
  });
});

const ordinaryLabels = [
  ['desktop.reviewComplete.read', 'Read', '已阅读'],
  ['desktop.reviewSession.summary.read', 'Read', '已阅读'],
  ['settings.appearance.fontPreset.default', 'Default', '默认'],
  ['settings.appearance.fontPreset.custom', 'Custom', '自定义'],
  ['desktop.sourceUpdate.dismiss', 'Dismiss', '不采用'],
  ['companion.sync.issuesToResolve', 'Issues to resolve', '待处理问题'],
  ['ordinary.flow', 'Flow', '流程'],
  ['ordinary.external', 'External folders', '外部文件夹'],
  ['ordinary.publish', 'Publish to the site', '发布到网站']
];

it.each(ordinaryLabels)('allows ordinary translation at %s', (key, english, translation) => {
  expect(compareEntry(key, english, translation, protectedLiterals)).toEqual([]);
  expect(protectedOccurrences(english, protectedLiterals, key)).toEqual([]);
});

it.each([
  ['desktop.reviewActions.reading.read', 'Read', '阅读'],
  ['desktop.actionHelp.review.read.title', 'Read', '阅读'],
  ['companion.tabs.learn', 'Flow', '流程'],
  ['settings.about.issues', 'Issues', '问题'],
  ['settings.externalSources.title', 'External folders', '外部文件夹']
])('preserves designated literal at %s in input and checks', (key, english, translation) => {
  expect(protectedOccurrences(english, protectedLiterals, key)).toContain(english);
  expect(compareEntry(key, english, translation, protectedLiterals))
    .toEqual([`${key}: protected literal changed`]);
  expect(sourceConflicts([{ en: { [key]: english }, zh: { [key]: translation } }], protectedLiterals, {}))
    .toEqual([`${key}: protected literal changed`]);
});

const pdfKey = 'desktop.nodeList.readwiseResync.confirm.pdf';
const englishPdf = 'This gets the original PDF from Readwise and places Readwise highlights on it again. Nothing else in the topic changes.';
const chinesePdf = '将从 Readwise 获取 PDF 原件，并把 Readwise 高亮重新定位到 PDF 上。主题的其他内容不会改动。';

it('allows natural repeated PDF mentions in both source and target checks', () => {
  expect(compareEntry(pdfKey, englishPdf, chinesePdf, protectedLiterals)).toEqual([]);
  expect(sourceConflicts([{ en: { [pdfKey]: englishPdf }, zh: { [pdfKey]: chinesePdf } }], protectedLiterals, {}))
    .toEqual([]);
  expect(protectedOccurrences(chinesePdf, protectedLiterals, pdfKey)).toEqual(['PDF', 'Readwise']);
});

it.each(['PDF', 'Readwise'])('still rejects omission of %s', (literal) => {
  const translation = chinesePdf.replaceAll(literal, '文件');
  expect(compareEntry(pdfKey, englishPdf, translation, protectedLiterals))
    .toEqual([`${pdfKey}: protected literal changed`]);
});

it('keeps placeholder multiplicity, URLs, markup and shortcut placeholders intact', () => {
  const english = '<b>{count}</b> **PDF** {count} {shortcut} https://foliole.app';
  expect(compareEntry('format', english, english.replace('{shortcut}', '快捷键'), protectedLiterals))
    .toContain('format: structure or placeholders changed');
  for (const removed of ['{count}', '<b>', '**', 'https://foliole.app']) {
    expect(compareEntry('format', english, english.replace(removed, ''), protectedLiterals))
      .toContain('format: structure or placeholders changed');
  }
});

it('resolves every scoped rule to its real source location without source conflicts', async () => {
  const domains = await loadSourceDomains(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  const english = flattenDomains(domains, 'en');
  for (const [key, literal] of Object.entries(protectedLiterals.exactByKey)) {
    expect(english[key], key).toBe(literal);
  }
  for (const [key, literals] of Object.entries(protectedLiterals.embeddedByKey)) {
    for (const literal of literals) expect(english[key], key).toContain(literal);
  }
  expect(sourceConflicts(domains, protectedLiterals, {})).toEqual([]);
});
