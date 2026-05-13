// @vitest-environment node

import { expect, it } from 'vitest';

import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import { createContextExcerptLocator } from '../../lib/core/import/controlledContextMatch.js';
import {
  findPreparedHighlightExcerptInLocator,
  prepareHighlightExcerptCandidate
} from '../../lib/core/import/highlightExcerptMatch.js';

function findLocatorText(content: string, text: string) {
  return findPreparedHighlightExcerptInLocator(createContextExcerptLocator(content), prepareHighlightExcerptCandidate({ text }));
}

it('matches readwise highlights when nested numbered list markers differ from the full document', () => {
  const source = [
    '#### **饮食促进多巴胺（白天）& 血清素（夜间）**',
    '',
    '帮助多巴胺和血清素等神经递质分泌的全天计划：',
    '',
    '1. **白天（以多巴胺为主）**：',
    '',
    '￮ **禁食和运动（早晨）**： 以断食和运动开始一天的生活，这样做有很多好处，包括提高警觉性和认知功能。运动尤其能提高多巴胺水平。',
    '',
    '￮ **高蛋白、适量脂肪、低/零碳水化合物午餐（中午）**：正餐应富含蛋白质和适量脂肪，尽量少吃或不吃碳水化合物。',
    '',
    '2. **晚上（专注于睡眠的血清素）**：',
    '',
    '￮ **避免大餐**： 为了促进良好的睡眠，晚上应避免进食过饱，因为临近睡前进食过饱会扰乱睡眠。',
    '',
    '个人对食物和饮食策略的反应可能会有所不同，倾听自己身体的信号并根据自己的感觉和具体的健康目标进行调整是非常重要的。'
  ].join('\n');
  const quote = [
    '1. **白天（以多巴胺为主）**：',
    '  ￮ **禁食和运动（早晨）**： 以断食和运动开始一天的生活，这样做有很多好处，包括提高警觉性和认知功能。运动尤其能提高多巴胺水平。',
    '  ￮ **高蛋白、适量脂肪、低/零碳水化合物午餐（中午）**：正餐应富含蛋白质和适量脂肪，尽量少吃或不吃碳水化合物。',
    '  2. **晚上（专注于睡眠的血清素）**：',
    '  ￮ **避免大餐**： 为了促进良好的睡眠，晚上应避免进食过饱，因为临近睡前进食过饱会扰乱睡眠。',
    '  个人对食物和饮食策略的反应可能会有所不同，倾听自己身体的信号并根据自己的感觉和具体的健康目标进行调整是非常重要的。'
  ].join('\n');

  const match = findLocatorText(source, quote);
  const anchored = applyImportedHighlightAnchors({
    content: source,
    highlights: [{ content: quote, label: null, locatorText: match }]
  });

  expect(match).not.toBeNull();
  expect(match).toContain('2. **晚上（专注于睡眠的血清素）**');
  expect(anchored.highlights[0]?.locatorText).toContain('1. **白天（以多巴胺为主）**');
  expect(anchored.highlights[0]?.locatorText).toContain('2. **晚上（专注于睡眠的血清素）**');
});
