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

it('keeps inline code opening markers when a highlight starts at code text', () => {
  const source = [
    '部署成功后，进入页面，在资源管理-`密钥和终结点` 找到密钥。',
    '微软会提供 2 个密钥，任选其一，将密钥填入沉浸式扩展-微软翻译的 `APIKEY` 里。',
    '',
    '后续配置说明。'
  ].join('\n');
  const quote = '`APIKEY` 里。 ([View Highlight](https://read.readwise.io/read/01jemgyp4ewx99y9w29vj71pkr))';

  const match = findLocatorText(source, quote);

  expect(match).toBe('`APIKEY` 里。');
});

it('keeps inline code closing markers when a highlight ends at code text', () => {
  const source = '将值填入 `APIKEY`。';
  const quote = 'APIKEY';

  const match = findLocatorText(source, quote);

  expect(match).toBe('`APIKEY`');
});
