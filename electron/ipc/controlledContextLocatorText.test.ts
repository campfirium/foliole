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

function expectLengthClose(match: string, quote: string) {
  const compact = (value: string) => value.replace(/\s+/g, ' ').trim();
  expect(Math.abs(compact(match).length - compact(quote).length)).toBeLessThanOrEqual(6);
}

it('matches the unique full source range before decoration anchoring', () => {
  const source = [
    '# GTD 项目管理方法',
    '',
    '收集箱：彻底放开',
    '',
    '把所有任务先放进收集箱，然后每天清理。不要在捕获阶段判断优先级。',
    '',
    '其他章节。'
  ].join('\n');
  const quote = ['### 收集箱：彻底放开', '', '把所有任务先放进收集箱，然后每天清理。不要在捕获阶段判断优先级。'].join('\n');

  const match = findLocatorText(source, quote);

  expect(match).toBe(['收集箱：彻底放开', '', '把所有任务先放进收集箱，然后每天清理。不要在捕获阶段判断优先级。'].join('\n'));
  expectLengthClose(match ?? '', quote);
});

it('does not return a unique short link title when the rest of the highlight is missing', () => {
  const source = [
    '# Shadowrocket 小火箭',
    '',
    'Shadowrocket-SS Subscription',
    '',
    '其他说明。'
  ].join('\n');
  const quote = [
    'Shadowrocket-SS Subscription',
    '',
    'https://example.com/subscription',
    '',
    '把链接复制到配置里，然后更新代理。'
  ].join('\n');

  expect(findLocatorText(source, quote)).toBeNull();
});

it('does not return a unique prompt heading when the prompt body is missing', () => {
  const source = [
    '# 搞定 Nano Banana，用这份提示词框架',
    '',
    '生成这样的图片，该怎么描述呢？',
    '',
    '后续是另一段不相关内容。'
  ].join('\n');
  const quote = [
    '生成这样的图片，该怎么描述呢？',
    '',
    '第一步：描述主体、背景和光线。',
    '',
    '第二步：补充构图、比例和风格限制。'
  ].join('\n');

  expect(findLocatorText(source, quote)).toBeNull();
});

it('does not return a unique config fragment when the highlight body is missing', () => {
  const source = [
    '# 微软 Azure 翻译',
    '',
    'APIKEY 里。',
    '',
    '其他配置说明。'
  ].join('\n');
  const quote = ['APIKEY 里。', '', '填写 ENDPOINT 和 REGION 后重启服务。'].join('\n');

  expect(findLocatorText(source, quote)).toBeNull();
});

it('does not return a frontmatter title when the article opening is missing', () => {
  const source = [
    '---',
    'title: 如何在大量任务中管理日志',
    '---',
    '',
    '# 如何在大量任务中管理日志',
    '',
    '这里是普通正文。'
  ].join('\n');
  const quote = ['如何在大量任务中管理日志', '', '系统应该记录每一步任务的状态变化，并能回放关键决策。'].join('\n');

  expect(findLocatorText(source, quote)).toBeNull();
});
