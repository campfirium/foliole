const CJK_CHARACTER = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/u;

// Approximation shared by every model channel: each CJK character counts as one token,
// every four other characters count as one.
export function estimateAideTokens(text: string) {
  let cjk = 0;
  let other = 0;
  for (const character of text) {
    if (CJK_CHARACTER.test(character)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

const SENTENCE_PATTERN = /[^.!?。！？\n]+(?:[.!?。！？]+["'”’)\]」』]*|\n+|$)\s*/gu;

export function splitAideSentences(text: string) {
  return (text.match(SENTENCE_PATTERN) ?? []).filter((sentence) => sentence.trim());
}

// Keeps whole sentences only, so a cut never ends mid-sentence.
export function truncateAideTextAtSentence(text: string, tokenAllowance: number) {
  let used = 0;
  let kept = '';
  for (const sentence of splitAideSentences(text)) {
    const cost = estimateAideTokens(sentence);
    if (used + cost > tokenAllowance) break;
    kept += sentence;
    used += cost;
  }
  return kept.trimEnd();
}
