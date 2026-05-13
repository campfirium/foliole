// @vitest-environment node

import { expect, it } from 'vitest';

import { createContextExcerptLocator } from '../../lib/core/import/controlledContextMatch.js';
import {
  findPreparedHighlightExcerptInLocator,
  prepareHighlightExcerptCandidate
} from '../../lib/core/import/highlightExcerptMatch.js';

function findLocatorText(content: string, text: string) {
  return findPreparedHighlightExcerptInLocator(createContextExcerptLocator(content), prepareHighlightExcerptCandidate({ text }));
}

it('matches readwise heading highlights that include empty github anchor links', () => {
  const source = [
    '#### 添加 Anki 卡片',
    '',
    'Anki 是一款经典的记忆卡片软件，它的设计理念影响了很多背单词软件。如果你不了解 Anki，可以看这个[简短的介绍视频](https://www.bilibili.com/video/BV1hz4y1U7H3/)。',
    '',
    '在 `appsettings.json` 中，与 Anki 有关的字段有以下这些：',
    '',
    '```',
    '"AnkiEnabled": true,',
    '"Anki": {',
    '    "AnkiConnectUrl": "http://127.0.0.1:8765", // AnkiConnect 默认端口',
    '    "Deck": "test",\t\t\t// 添加卡片的目标牌组',
    '    "Model": "ja-learner",\t\t// 卡片的模板名',
    '}',
    '```',
    '',
    '使用 Anki 的准备工作如下：'
  ].join('\n');
  const quote = [
    '加 Anki 卡片[](https://github.com/ks233/ja-learner#添加-anki-卡片)',
    '  Anki 是一款经典的记忆卡片软件，它的设计理念影响了很多背单词软件。如果你不了解 Anki，可以看这个[简短的介绍视频](https://www.bilibili.com/video/BV1hz4y1U7H3/)。',
    '  在 `appsettings.json` 中，与 Anki 有关的字段有以下这些：',
    '  "AnkiEnabled": true,',
    '  "Anki": {',
    '  "AnkiConnectUrl": "http://127.0.0.1:8765", // AnkiConnect 默认端口',
    '  "Deck": "test", // 添加卡片的目标牌组',
    '  "Model": "ja-learner", // 卡片的模板名',
    '  }',
    '  使用 Anki 的准备工作如下：'
  ].join('\n');

  const match = findLocatorText(source, quote);

  expect(match).not.toBeNull();
  expect(match).toContain('#### 添加 Anki 卡片');
  expect(match).toContain('"AnkiConnectUrl"');
  expect(match).toContain('使用 Anki 的准备工作如下：');
});
