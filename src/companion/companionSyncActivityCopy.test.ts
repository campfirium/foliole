import { beforeAll, describe, expect, it } from 'vitest';

import { preloadTranslationCatalog, translate } from '../shared/localization/translations';

import { formatSyncResultMessage, isReportableSyncEvent } from './companionSyncActivityCopy';

const t = translate.bind(null, 'en');
const zhHans = translate.bind(null, 'zh-Hans');

beforeAll(async () => {
  await preloadTranslationCatalog('zh-Hans');
});

describe('formatSyncResultMessage', () => {
  it('hides diagnostic timing for check-only completion', () => {
    expect(formatSyncResultMessage(
      'Sync fully completed; timing: topic list 1s, topic bodies 0.1s, attachment files 0.1s',
      t
    )).toBe('No changes to sync.');
  });

  it('keeps actual downloaded resource summaries', () => {
    expect(formatSyncResultMessage(
      'Sync fully completed; downloaded 1 topic body in this sync; timing: topic bodies 1s',
      t
    )).toBe('Downloaded 1 topic body in this sync.');
  });

  it('localizes downloaded resource summaries', () => {
    expect(formatSyncResultMessage(
      'Sync made progress; downloaded 1 topic body and 2 attachment files in this sync in 2s',
      zhHans
    )).toBe('本次同步已下载1 个主题正文和2 个附件文件，耗时 2s。');
  });

  it('does not report check-only completed events as visible activity', () => {
    expect(isReportableSyncEvent({
      message: 'Sync fully completed; timing: topic list 1s',
      status: 'completed'
    })).toBe(false);
  });

  it('keeps started events out of historical Activity', () => {
    expect(isReportableSyncEvent({
      message: 'Sync started.',
      status: 'started'
    })).toBe(false);
  });

  it('keeps structured stage facts out of historical Activity', () => {
    expect(isReportableSyncEvent({
      kind: 'stage_finished',
      message: 'Body files downloaded.',
      status: 'completed'
    })).toBe(false);
  });
});
