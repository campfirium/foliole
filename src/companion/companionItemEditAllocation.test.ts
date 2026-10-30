import { expect, it } from 'vitest';

import { allocateItemEditHeight } from './companionItemEditAllocation';

it.each([
  [400, 50, 80, [247.2, 152.8]],
  [400, 0, 0, [247.2, 152.8]],
  [400, 280, 60, [280, 120]],
  [400, 60, 280, [120, 280]],
  [400, 50, 1000, [50, 350]],
  [400, 1000, 50, [350, 50]],
  [400, 1000, 800, [200, 200]],
  [120, 1000, 800, [60, 60]],
  [0, 1000, 800, [0, 0]]
])('allocates %s visible pixels for question %s and answer %s', (height, question, answer, expected) => {
  expect(allocateItemEditHeight(height as number, question as number, answer as number)).toEqual(expected);
});
