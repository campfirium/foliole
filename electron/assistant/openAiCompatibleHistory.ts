import type { NativeAssistantThreadMessageRecord } from '../../lib/platform/nativeAssistantContract.js';

const HISTORY_CHARACTER_BUDGET = 24_000;

export function selectRecentOpenAiCompatibleHistory(
  messages: NativeAssistantThreadMessageRecord[]
) {
  const selected: NativeAssistantThreadMessageRecord[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0;) {
    const end = index;
    let start = index;
    if (messages[index]?.role === 'assistant' && messages[index - 1]?.role === 'user') {
      start = index - 1;
    }
    const turn = messages.slice(start, end + 1);
    const size = turn.reduce((total, item) => total + item.text.length, 0);
    if (used + size > HISTORY_CHARACTER_BUDGET) break;
    selected.unshift(...turn);
    used += size;
    index = start - 1;
  }
  return selected;
}
