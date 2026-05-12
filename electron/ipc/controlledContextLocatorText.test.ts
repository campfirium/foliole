// @vitest-environment node

import { expect, it } from 'vitest';

import { normalizeQuoteText } from '../../lib/core/import/contextExcerptQuoteLocator.js';
import { createContextExcerptLocator } from '../../lib/core/import/controlledContextMatch.js';
import {
  findPreparedHighlightExcerptInLocator,
  prepareHighlightExcerptCandidate
} from '../../lib/core/import/highlightExcerptMatch.js';

function findLocatorText(content: string, text: string) {
  return findPreparedHighlightExcerptInLocator(createContextExcerptLocator(content), prepareHighlightExcerptCandidate({ text }));
}

function expectLengthClose(match: string, quote: string) {
  expect(Math.abs(normalizeQuoteText(match).length - normalizeQuoteText(quote).length)).toBeLessThanOrEqual(6);
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

it('does not choose between duplicate full source ranges with identical text', () => {
  const quote = ['重复段落标题', '', '这一段高亮正文在两个地方完全一样。'].join('\n');
  const source = [
    '# 第一处',
    '',
    quote,
    '',
    '# 第二处',
    '',
    quote
  ].join('\n');

  expect(findLocatorText(source, quote)).toBeNull();
});

it('matches Nano Banana highlight despite autolink and escaped underscore differences', () => {
  const source = [
    '# 搞定Nano Banana，用这份提示词框架',
    '',
    '举个例子，要生成这样的图片，该怎么描述呢？这是我的提示词。它采用JSON格式，包含了九个部分。',
    '',
    '<https://medium.com/media/856a24ef6a4fb2e4ce5244b170c0b191/href>第一，shot。它定义了整个镜头是什么样的。比如，这是一个微距特写镜头，采用居中构图。',
    '',
    '第二，subject。它定义了画面中的主体。这个主体可以是人，也可以是物。比如，这是一款奢华的男士腕表。它的表壳是不锈钢抛光的。它的表盘是白色的。',
    '',
    '第六，color\\_grade。它定义了画面的色彩风格。比如，对比度要高，饱和度可以低一点点。',
    '',
    '第九，negatives。它定义了我们不希望出现在画面中的内容。比如，我们不喜欢有品牌的Logo出现，也不要出现手。这个非常关键。如果你不交代的话，很可能AI会自作主张加上去。'
  ].join('\n');
  const quote = [
    '生成这样的图片，该怎么描述呢？这是我的提示词。它采用JSON格式，包含了九个部分。',
    '[https://medium.com/media/856a24ef6a4fb2e4ce5244b170c0b191/href](https://medium.com/media/856a24ef6a4fb2e4ce5244b170c0b191/href)',
    '第一，shot。它定义了整个镜头是什么样的。比如，这是一个微距特写镜头，采用居中构图。',
    '第二，subject。它定义了画面中的主体。这个主体可以是人，也可以是物。比如，这是一款奢华的男士腕表。它的表壳是不锈钢抛光的。它的表盘是白色的。',
    '第六，color_grade。它定义了画面的色彩风格。比如，对比度要高，饱和度可以低一点点。',
    '第九，negatives。它定义了我们不希望出现在画面中的内容。比如，我们不喜欢有品牌的Logo出现，也不要出现手。这个非常关键。如果你不交代的话，很可能AI会自作主张加上去。'
  ].join('\n');

  const match = findLocatorText(source, quote);

  expect(match).not.toBeNull();
  expect(match).toContain('生成这样的图片');
  expect(match).toContain('color\\_grade');
  expectLengthClose(match ?? '', quote);
});

it('matches Codex engineering highlight when reader bullets differ from markdown bullets', () => {
  const source = [
    '# 驾驭工程：在「智能体优先」的世界里借力 Codex',
    '',
    '#### 将仓库知识打造为“单一事实来源”',
    '',
    '**上下文工程 (Context Engineering)** 是让智能体有效处理庞大复杂任务的最大挑战之一。',
    '',
    '* **上下文资源稀缺。** 巨大的说明文件会挤占任务描述、代码和相关文档的空间。',
    '* **过多的指导等于*没有指导*。** 当一切都“重要”时，就没什么是重要的了。',
    '* **文档即刻腐烂。** 单体式的说明书会变成过时规则的坟场。',
    '',
    '因此，我们不把 `AGENTS.md` 当作百科全书，而是把它当作**目录**。'
  ].join('\n');
  const quote = [
    '将仓库知识打造为“单一事实来源”',
    '**上下文工程 (Context Engineering)** 是让智能体有效处理庞大复杂任务的最大挑战之一。',
    '• **上下文资源稀缺。** 巨大的说明文件会挤占任务描述、代码和相关文档的空间。',
    '• **过多的指导等于*没有指导*。** 当一切都“重要”时，就没什么是重要的了。',
    '• **文档即刻腐烂。** 单体式的说明书会变成过时规则的坟场。',
    '因此，我们不把 `AGENTS.md` 当作百科全书，而是把它当作**目录**。'
  ].join('\n');

  const match = findLocatorText(source, quote);

  expect(match).not.toBeNull();
  expect(match).toContain('将仓库知识打造为“单一事实来源”');
  expect(match).toContain('* **上下文资源稀缺。**');
  expectLengthClose(match ?? '', quote);
});
