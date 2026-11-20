import { beforeAll, expect, it } from 'vitest';

import { preloadTranslationCatalog, translate } from '../shared/localization/translations';

import { resolveCompanionHistoryLabel } from './companionHistoryActionLabel';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});

const en = (key: never, params?: never) => translate('en', key, params);
const zh = (key: never, params?: never) => translate('zh-Hans', key, params);

it('names the step the button will undo or redo with a short verb', () => {
  expect(resolveCompanionHistoryLabel('undo', { type: 'nodes.change', title: 'Move to Trash' }, en as never)).toBe('Undo Delete');
  expect(resolveCompanionHistoryLabel('redo', { type: 'nodes.change', title: 'Restore from Trash' }, en as never)).toBe('Redo Restore');
  expect(resolveCompanionHistoryLabel('undo', { type: 'nodes.change', title: 'Create folder' }, zh as never)).toBe('撤销新建');
  expect(resolveCompanionHistoryLabel('undo', { type: 'review.grade', title: null }, zh as never)).toBe('撤销评分');
});

it('falls back to the plain label when the step is unknown or the stack is empty', () => {
  expect(resolveCompanionHistoryLabel('undo', null, en as never)).toBe('Undo');
  expect(resolveCompanionHistoryLabel('redo', { type: 'nodes.change', title: 'Something new' }, zh as never)).toBe('重做');
});
